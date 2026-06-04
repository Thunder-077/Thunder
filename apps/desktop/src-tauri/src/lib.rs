mod runtime_paths;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
    collections::{HashMap, HashSet},
    fs,
    fs::File,
    fs::OpenOptions,
    io::{self, BufReader, Read, Write},
    net::{TcpListener, TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use bzip2::read::BzDecoder;
use serde::{Deserialize, Serialize};
use sherpa_onnx::{OnlineRecognizer, OnlineRecognizerConfig, OnlineStream};
use tar::Archive;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, WebviewWindow, WindowEvent,
};
#[cfg(any(target_os = "windows", target_os = "macos"))]
use tauri_plugin_decorum::WebviewWindowExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use runtime_paths::{
    collect_runtime_root_candidates, normalize_path_for_child_process,
    resolve_runtime_root_from_candidates,
};

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_SHOW_ID: &str = "tray-show";
const TRAY_HIDE_ID: &str = "tray-hide";
const TRAY_QUIT_ID: &str = "tray-quit";
const DESKTOP_SHORTCUT: &str = "CommandOrControl+Shift+T";
const DESKTOP_ENV_FILE_NAME: &str = "desktop.env";
const DEFAULT_NATIVE_API_PORT: u16 = 43102;
const NATIVE_HTTP_READ_TIMEOUT: Duration = Duration::from_secs(5);
const NATIVE_HTTP_MAX_BODY_BYTES: usize = 2 * 1024 * 1024;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[allow(dead_code)]
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RuntimeManifest {
    web_port: u16,
    api_port: u16,
    sherpa_port: Option<u16>,
    web_entry: String,
    api_entry: String,
    node_entry: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SherpaModelSummary {
    id: String,
    name: String,
    description: String,
    language: String,
    runtime: String,
    size: String,
    installed: bool,
    active: bool,
    downloading: bool,
    download_progress: Option<SherpaDownloadProgress>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SherpaDownloadProgress {
    percentage: u32,
    downloaded: u64,
    total: u64,
    status: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SherpaModelCatalogEntry {
    id: String,
    name: String,
    description: String,
    language: String,
    runtime: String,
    size: String,
    archive_root: String,
    download_url: String,
    files: HashMap<String, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SherpaRecognitionUpdate {
    text: String,
    segment: i32,
    is_final: bool,
}

#[derive(Deserialize)]
struct SherpaActiveModelState {
    id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeModelRequest {
    model_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeSherpaFeedRequest {
    samples: Vec<i16>,
    input_finished: Option<bool>,
}

struct SherpaSession {
    recognizer: OnlineRecognizer,
    stream: OnlineStream,
    sample_rate: i32,
    segment: i32,
    last_text: String,
}

#[cfg(target_os = "windows")]
struct WindowsJob {
    handle: *mut std::ffi::c_void,
}

#[cfg(target_os = "windows")]
impl WindowsJob {
    fn new() -> io::Result<Self> {
        use std::ptr;
        extern "system" {
            fn CreateJobObjectW(
                lpJobAttributes: *mut std::ffi::c_void,
                lpName: *const u16,
            ) -> *mut std::ffi::c_void;
            fn SetInformationJobObject(
                hJob: *mut std::ffi::c_void,
                JobObjectInformationClass: u32,
                lpJobObjectInformation: *mut std::ffi::c_void,
                cbJobObjectInformationLength: u32,
            ) -> i32;
        }

        let handle = unsafe { CreateJobObjectW(ptr::null_mut(), ptr::null()) };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }

        #[repr(C)]
        struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
            per_process_user_time_limit: i64,
            per_job_user_time_limit: i64,
            limit_flags: u32,
            minimum_working_set_size: usize,
            maximum_working_set_size: usize,
            active_process_limit: u32,
            affinity: usize,
            priority_class: u32,
            scheduling_class: u32,
        }

        #[repr(C)]
        struct IO_COUNTERS {
            read_operation_count: u64,
            write_operation_count: u64,
            other_operation_count: u64,
            read_transfer_count: u64,
            write_transfer_count: u64,
            other_transfer_count: u64,
        }

        #[repr(C)]
        struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
            basic_limit_information: JOBOBJECT_BASIC_LIMIT_INFORMATION,
            io_info: IO_COUNTERS,
            process_memory_limit: usize,
            job_memory_limit: usize,
            peak_process_memory_used: usize,
            peak_job_memory_used: usize,
        }

        const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x2000;
        const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: u32 = 9;

        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
            basic_limit_information: JOBOBJECT_BASIC_LIMIT_INFORMATION {
                per_process_user_time_limit: 0,
                per_job_user_time_limit: 0,
                limit_flags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                minimum_working_set_size: 0,
                maximum_working_set_size: 0,
                active_process_limit: 0,
                affinity: 0,
                priority_class: 0,
                scheduling_class: 0,
            },
            io_info: IO_COUNTERS {
                read_operation_count: 0,
                write_operation_count: 0,
                other_operation_count: 0,
                read_transfer_count: 0,
                write_transfer_count: 0,
                other_transfer_count: 0,
            },
            process_memory_limit: 0,
            job_memory_limit: 0,
            peak_process_memory_used: 0,
            peak_job_memory_used: 0,
        };

        let res = unsafe {
            SetInformationJobObject(
                handle,
                JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
                &mut info as *mut _ as *mut std::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };

        if res == 0 {
            unsafe {
                extern "system" {
                    fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
                }
                CloseHandle(handle);
            }
            return Err(io::Error::last_os_error());
        }

        Ok(WindowsJob { handle })
    }

    fn assign(&self, child: &Child) -> io::Result<()> {
        use std::os::windows::io::AsRawHandle;
        extern "system" {
            fn AssignProcessToJobObject(
                hJob: *mut std::ffi::c_void,
                hProcess: *mut std::ffi::c_void,
            ) -> i32;
        }

        let process_handle = child.as_raw_handle();
        let res = unsafe {
            AssignProcessToJobObject(self.handle, process_handle as *mut std::ffi::c_void)
        };
        if res == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
impl Drop for WindowsJob {
    fn drop(&mut self) {
        extern "system" {
            fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
        }
        unsafe {
            CloseHandle(self.handle);
        }
    }
}

#[cfg(target_os = "windows")]
unsafe impl Send for WindowsJob {}
#[cfg(target_os = "windows")]
unsafe impl Sync for WindowsJob {}

struct DesktopState {
    is_quitting: AtomicBool,
    sidecars: Mutex<Vec<Child>>,
    sherpa_session: Mutex<Option<SherpaSession>>,
    downloading_models: Mutex<HashSet<String>>,
    sherpa_download_progress: Mutex<HashMap<String, SherpaDownloadProgress>>,
    #[cfg(target_os = "windows")]
    job: Option<WindowsJob>,
}

fn get_main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = get_main_window(app) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = get_main_window(app) {
        let _ = window.hide();
    }
}

fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = get_main_window(app) {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
            }
            Ok(false) | Err(_) => {
                show_main_window(app);
            }
        }
    }
}

fn kill_sidecars<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<DesktopState>();
    state.sherpa_session.lock().unwrap().take();
    let mut sidecars = state.sidecars.lock().unwrap();
    for child in sidecars.iter_mut() {
        let _ = child.kill();
        let _ = child.wait();
    }
    sidecars.clear();
}

fn quit_app<R: Runtime>(app: &AppHandle<R>) {
    app.state::<DesktopState>()
        .is_quitting
        .store(true, Ordering::SeqCst);
    kill_sidecars(app);
    app.exit(0);
}

fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, TRAY_SHOW_ID, "显示 Thunder", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, TRAY_HIDE_ID, "隐藏窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, TRAY_QUIT_ID, "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

    let mut tray = TrayIconBuilder::with_id("thunder-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            TRAY_SHOW_ID => show_main_window(app),
            TRAY_HIDE_ID => hide_main_window(app),
            TRAY_QUIT_ID => quit_app(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(&tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;
    Ok(())
}

fn register_desktop_shortcut<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<(), tauri_plugin_global_shortcut::Error> {
    // 快捷键只负责窗口显隐，不触碰任何业务模块状态。
    app.global_shortcut()
        .on_shortcut(DESKTOP_SHORTCUT, move |app, _, event| {
            if event.state == ShortcutState::Pressed {
                toggle_main_window(app);
            }
        })
}

fn parse_env_file(contents: &str) -> HashMap<String, String> {
    contents
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                return None;
            }

            let (key, value) = trimmed.split_once('=')?;
            let normalized = value
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_string();
            Some((key.trim().to_string(), normalized))
        })
        .collect()
}

fn load_desktop_env<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<HashMap<String, String>> {
    let mut env_map = HashMap::new();

    let config_dir = app.path().app_config_dir()?;
    let env_path = config_dir.join(DESKTOP_ENV_FILE_NAME);
    if env_path.exists() {
        let contents = fs::read_to_string(env_path)?;
        env_map.extend(parse_env_file(&contents));
    }

    Ok(env_map)
}

fn resolve_runtime_root<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<PathBuf> {
    // 安装包布局会随 bundle 目标变化，统一按候选路径探测 runtime 根目录。
    let resource_dir = app.path().resource_dir().ok();
    let executable_path = std::env::current_exe().ok();
    let candidates =
        collect_runtime_root_candidates(resource_dir.as_deref(), executable_path.as_deref());

    resolve_runtime_root_from_candidates(&candidates).map_err(Into::into)
}

fn read_runtime_manifest<R: Runtime>(
    app: &AppHandle<R>,
) -> tauri::Result<(RuntimeManifest, PathBuf)> {
    let runtime_root = resolve_runtime_root(app)?;
    let manifest_path = runtime_root.join("manifest.json");
    let manifest = serde_json::from_str::<RuntimeManifest>(&fs::read_to_string(&manifest_path)?)?;
    Ok((manifest, runtime_root))
}

fn spawn_node_process(
    node_path: &Path,
    entry_path: &Path,
    cwd: &Path,
    envs: &HashMap<String, String>,
    log_path: &Path,
) -> io::Result<Child> {
    let log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)?;
    let stderr_file = log_file.try_clone()?;

    let mut command = Command::new(node_path);
    command
        .arg(entry_path)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(stderr_file));

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    for (key, value) in envs {
        command.env(key, value);
    }

    command.spawn()
}

fn append_runtime_log(log_path: &Path, message: &str) {
    if let Some(parent_dir) = log_path.parent() {
        let _ = fs::create_dir_all(parent_dir);
    }

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = writeln!(file, "{}", message);
    }
}

fn wait_for_port(port: u16, timeout: Duration) -> io::Result<()> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        let mut addrs = ("127.0.0.1", port).to_socket_addrs()?;
        if let Some(addr) = addrs.next() {
            if TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok() {
                return Ok(());
            }
        }

        thread::sleep(Duration::from_millis(200));
    }

    Err(io::Error::new(
        io::ErrorKind::TimedOut,
        format!("port {} did not become ready in time", port),
    ))
}

fn start_local_runtime<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if cfg!(debug_assertions) {
        return Ok(());
    }

    let (manifest, runtime_root) = read_runtime_manifest(app)?;
    let mut desktop_env = load_desktop_env(app)?;

    // Dynamically resolve and inject local SQLite DATABASE_URL
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&app_data_dir);
        let db_path = app_data_dir.join("app.db");
        let database_url = format!("file:{}", db_path.to_string_lossy());
        desktop_env.insert("DATABASE_URL".into(), database_url);
    }

    let localhost_api_url = format!("http://127.0.0.1:{}", manifest.api_port);
    let localhost_web_host = format!("127.0.0.1:{}", manifest.web_port);

    desktop_env
        .entry("HOSTNAME".into())
        .or_insert_with(|| "127.0.0.1".into());
    desktop_env.insert("API_PORT".into(), manifest.api_port.to_string());
    desktop_env.insert("API_URL".into(), localhost_api_url.clone());
    desktop_env.insert(
        "THUNDER_DESKTOP_NATIVE_API_URL".into(),
        format!("http://127.0.0.1:{}", DEFAULT_NATIVE_API_PORT),
    );

    let web_env = {
        let mut env = desktop_env.clone();
        env.insert("PORT".into(), manifest.web_port.to_string());
        env.insert("HOSTNAME".into(), "127.0.0.1".into());
        env
    };
    let api_env = desktop_env;

    // Node 在 Windows 下不能稳定处理 verbatim path（\\?\...），启动前统一归一化。
    let node_path = normalize_path_for_child_process(&runtime_root.join(&manifest.node_entry));
    let web_entry = normalize_path_for_child_process(&runtime_root.join(&manifest.web_entry));
    let api_entry = normalize_path_for_child_process(&runtime_root.join(&manifest.api_entry));
    let runtime_cwd = normalize_path_for_child_process(&runtime_root);
    let runtime_log_dir = app
        .path()
        .app_log_dir()
        .or_else(|_| app.path().app_data_dir().map(|dir| dir.join("logs")))?;
    let api_log_path = runtime_log_dir.join("desktop-api.log");
    let web_log_path = runtime_log_dir.join("desktop-web.log");
    let launcher_log_path = runtime_log_dir.join("desktop-launcher.log");
    let executable_path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("<unknown>"));
    append_runtime_log(
        &launcher_log_path,
        &format!(
            "[desktop-runtime] version={} exe={} runtime_root={} node={} api_entry={} web_entry={} cwd={}",
            app.package_info().version,
            executable_path.display(),
            runtime_root.display(),
            node_path.display(),
            api_entry.display(),
            web_entry.display(),
            runtime_cwd.display()
        ),
    );

    let api_child = spawn_node_process(
        &node_path,
        &api_entry,
        &runtime_cwd,
        &api_env,
        &api_log_path,
    )?;
    let web_child = spawn_node_process(
        &node_path,
        &web_entry,
        &runtime_cwd,
        &web_env,
        &web_log_path,
    )?;

    {
        let state = app.state::<DesktopState>();

        #[cfg(target_os = "windows")]
        if let Some(ref job) = state.job {
            let _ = job.assign(&api_child);
            let _ = job.assign(&web_child);
        }

        let mut sidecars = state.sidecars.lock().unwrap();
        sidecars.push(api_child);
        sidecars.push(web_child);
    }

    if let Err(error) = wait_for_port(manifest.api_port, Duration::from_secs(30)) {
        append_runtime_log(
            &launcher_log_path,
            &format!(
                "[desktop-runtime] api port {} failed: {}. See {}",
                manifest.api_port,
                error,
                api_log_path.display()
            ),
        );
        return Err(error.into());
    }
    if let Err(error) = wait_for_port(manifest.web_port, Duration::from_secs(30)) {
        append_runtime_log(
            &launcher_log_path,
            &format!(
                "[desktop-runtime] web port {} failed: {}. See {}",
                manifest.web_port,
                error,
                web_log_path.display()
            ),
        );
        return Err(error.into());
    }
    println!(
        "Thunder desktop runtime ready on http://{}",
        localhost_web_host
    );

    Ok(())
}

#[tauri::command]
fn get_desktop_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

fn resolve_sherpa_catalog_path<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    if cfg!(debug_assertions) {
        let workspace = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("..");
        let service_root = workspace.join("services").join("sherpa-onnx");
        let catalog = service_root.join("model-catalog.json");
        return catalog;
    }

    let runtime_root = resolve_runtime_root(app).unwrap_or_default();
    let service_root = runtime_root.join("services").join("sherpa-onnx");
    service_root.join("model-catalog.json")
}

fn resolve_sherpa_config<R: Runtime>(app: &AppHandle<R>) -> (PathBuf, PathBuf, PathBuf) {
    let catalog = resolve_sherpa_catalog_path(app);
    let app_data_root = app.path().app_data_dir().unwrap_or_else(|_| {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home).join(".thunder")
    });
    let sherpa_root = app_data_root.join("speech").join("sherpa-onnx");
    let model_dir = sherpa_root.join("models");
    let state_dir = sherpa_root.join("state");

    (catalog, model_dir, state_dir)
}

fn ensure_sherpa_storage(model_dir: &Path, state_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(model_dir).map_err(|e| format!("创建 sherpa 模型目录失败: {e}"))?;
    fs::create_dir_all(state_dir).map_err(|e| format!("创建 sherpa 状态目录失败: {e}"))?;
    Ok(())
}

fn load_sherpa_catalog(catalog: &Path) -> Result<Vec<SherpaModelCatalogEntry>, String> {
    let content =
        fs::read_to_string(catalog).map_err(|e| format!("读取 sherpa 模型目录失败: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("解析 sherpa 模型目录失败: {e}"))
}

fn load_active_sherpa_model_id(state_dir: &Path) -> Option<String> {
    let state_file = state_dir.join("active-model.json");
    let content = fs::read_to_string(state_file).ok()?;
    serde_json::from_str::<SherpaActiveModelState>(&content)
        .ok()
        .and_then(|state| state.id)
}

fn save_active_sherpa_model_id(state_dir: &Path, model_id: &str) -> Result<(), String> {
    let content = serde_json::to_string_pretty(&serde_json::json!({ "id": model_id }))
        .map_err(|e| format!("序列化 sherpa 当前模型状态失败: {e}"))?;
    fs::write(state_dir.join("active-model.json"), format!("{content}\n"))
        .map_err(|e| format!("写入 sherpa 当前模型状态失败: {e}"))
}

fn is_sherpa_model_installed(model_dir: &Path, model: &SherpaModelCatalogEntry) -> bool {
    let model_root = model_dir.join(&model.archive_root);
    model
        .files
        .values()
        .all(|relative_path| model_root.join(relative_path).exists())
}

fn list_sherpa_models_from_catalog(
    catalog: &Path,
    model_dir: &Path,
    state_dir: &Path,
    downloading_models: &HashSet<String>,
    download_progress: &HashMap<String, SherpaDownloadProgress>,
) -> Result<Vec<SherpaModelSummary>, String> {
    let entries = load_sherpa_catalog(catalog)?;
    let active_model_id = load_active_sherpa_model_id(state_dir);
    let mut models = entries
        .into_iter()
        .map(|entry| {
            let installed = is_sherpa_model_installed(model_dir, &entry);
            let downloading = downloading_models.contains(&entry.id);
            let progress = download_progress.get(&entry.id).cloned();
            SherpaModelSummary {
                active: installed && active_model_id.as_deref() == Some(entry.id.as_str()),
                id: entry.id,
                name: entry.name,
                description: entry.description,
                language: entry.language,
                runtime: entry.runtime,
                size: entry.size,
                installed,
                downloading,
                download_progress: progress,
            }
        })
        .collect::<Vec<_>>();

    if !models.iter().any(|model| model.active) {
        if let Some(first_installed) = models.iter_mut().find(|model| model.installed) {
            first_installed.active = true;
        }
    }

    Ok(models)
}

fn update_sherpa_download_progress<R: Runtime>(
    app: &AppHandle<R>,
    model_id: &str,
    percentage: u32,
    downloaded: u64,
    total: u64,
    status: &str,
) {
    let progress = SherpaDownloadProgress {
        percentage,
        downloaded,
        total,
        status: status.to_string(),
    };

    {
        let state = app.state::<DesktopState>();
        state
            .sherpa_download_progress
            .lock()
            .unwrap()
            .insert(model_id.to_string(), progress);
    }

    let _ = app.emit(
        "sherpa-download-progress",
        serde_json::json!({
            "modelId": model_id,
            "percentage": percentage,
            "downloaded": downloaded,
            "total": total,
            "status": status,
        }),
    );
}

fn find_sherpa_model<'a>(
    catalog: &'a [SherpaModelCatalogEntry],
    model_id: &str,
) -> Result<&'a SherpaModelCatalogEntry, String> {
    catalog
        .iter()
        .find(|model| model.id == model_id)
        .ok_or_else(|| format!("未知 sherpa 模型: {model_id}"))
}

fn download_sherpa_model_archive<R: Runtime>(
    app: &AppHandle<R>,
    model: &SherpaModelCatalogEntry,
    state_dir: &Path,
) -> Result<PathBuf, String> {
    let archive_path = state_dir.join(format!("{}.download.tar.bz2", model.id));
    let response = ureq::get(&model.download_url)
        .call()
        .map_err(|e| format!("下载 sherpa 模型失败: {e}"))?;

    let total_bytes = response
        .header("Content-Length")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);

    let mut reader = response.into_reader();
    let mut file =
        File::create(&archive_path).map_err(|e| format!("创建 sherpa 模型临时文件失败: {e}"))?;

    let mut buffer = [0; 65536];
    let mut downloaded_bytes = 0u64;
    let mut last_percentage = 0u32;

    update_sherpa_download_progress(app, &model.id, 0, 0, total_bytes, "downloading");

    loop {
        let bytes_read = reader
            .read(&mut buffer)
            .map_err(|e| format!("读取 sherpa 模型数据失败: {e}"))?;

        if bytes_read == 0 {
            break;
        }

        file.write_all(&buffer[..bytes_read])
            .map_err(|e| format!("写入 sherpa 模型临时文件失败: {e}"))?;

        downloaded_bytes += bytes_read as u64;

        if total_bytes > 0 {
            let percentage = ((downloaded_bytes as f64 / total_bytes as f64) * 100.0) as u32;
            if percentage > last_percentage {
                last_percentage = percentage;
                update_sherpa_download_progress(
                    app,
                    &model.id,
                    percentage,
                    downloaded_bytes,
                    total_bytes,
                    "downloading",
                );
            }

            if downloaded_bytes >= total_bytes {
                break;
            }
        }
    }

    file.sync_all()
        .map_err(|e| format!("刷新数据到磁盘失败: {e}"))?;
    Ok(archive_path)
}

fn extract_sherpa_archive(archive_path: &Path, model_dir: &Path) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|e| format!("打开 sherpa 模型压缩包失败: {e}"))?;
    let reader = BufReader::new(file);
    let decoder = BzDecoder::new(reader);
    let mut archive = Archive::new(decoder);
    archive
        .unpack(model_dir)
        .map_err(|e| format!("解压 sherpa 模型失败: {e}"))
}

fn install_sherpa_model<R: Runtime>(
    app: &AppHandle<R>,
    model: &SherpaModelCatalogEntry,
    model_dir: &Path,
    state_dir: &Path,
) -> Result<(), String> {
    if is_sherpa_model_installed(model_dir, model) {
        return Ok(());
    }

    let archive_path = download_sherpa_model_archive(app, model, state_dir)?;

    update_sherpa_download_progress(app, &model.id, 100, 0, 0, "extracting");

    let result = extract_sherpa_archive(&archive_path, model_dir);
    let _ = fs::remove_file(&archive_path);
    result
}

fn resolve_active_sherpa_model(
    catalog: &Path,
    model_dir: &Path,
    state_dir: &Path,
) -> Result<(SherpaModelCatalogEntry, PathBuf), String> {
    let entries = load_sherpa_catalog(catalog)?;
    let active_model_id = load_active_sherpa_model_id(state_dir);
    let mut candidates = entries;

    if let Some(active_model_id) = active_model_id.as_deref() {
        candidates.retain(|model| model.id == active_model_id);
    }

    for model in candidates {
        if is_sherpa_model_installed(model_dir, &model) {
            let model_root = model_dir.join(&model.archive_root);
            return Ok((model, model_root));
        }
    }

    Err("未找到可用的 sherpa-onnx 模型，请先下载并激活一个模型。".into())
}

fn create_sherpa_recognizer(
    catalog: &Path,
    model_dir: &Path,
    state_dir: &Path,
) -> Result<OnlineRecognizer, String> {
    let (model, model_root) = resolve_active_sherpa_model(catalog, model_dir, state_dir)?;
    let mut config = OnlineRecognizerConfig::default();

    config.model_config.tokens = Some(
        model_root
            .join(
                model
                    .files
                    .get("tokens")
                    .ok_or_else(|| "模型定义缺少 tokens 文件".to_string())?,
            )
            .to_string_lossy()
            .to_string(),
    );
    config.model_config.num_threads = 2;
    config.model_config.provider = Some("cpu".into());
    config.decoding_method = Some("greedy_search".into());
    config.max_active_paths = 4;
    config.enable_endpoint = true;
    config.rule1_min_trailing_silence = 2.4;
    config.rule2_min_trailing_silence = 1.0;
    config.rule3_min_utterance_length = 20.0;

    match model.runtime.as_str() {
        "streaming-paraformer" => {
            config.model_config.paraformer.encoder = Some(
                model_root
                    .join(
                        model
                            .files
                            .get("paraformerEncoder")
                            .ok_or_else(|| "模型定义缺少 paraformer encoder".to_string())?,
                    )
                    .to_string_lossy()
                    .to_string(),
            );
            config.model_config.paraformer.decoder = Some(
                model_root
                    .join(
                        model
                            .files
                            .get("paraformerDecoder")
                            .ok_or_else(|| "模型定义缺少 paraformer decoder".to_string())?,
                    )
                    .to_string_lossy()
                    .to_string(),
            );
        }
        "streaming-zipformer" => {
            config.model_config.transducer.encoder = Some(
                model_root
                    .join(
                        model
                            .files
                            .get("encoder")
                            .ok_or_else(|| "模型定义缺少 encoder".to_string())?,
                    )
                    .to_string_lossy()
                    .to_string(),
            );
            config.model_config.transducer.decoder = Some(
                model_root
                    .join(
                        model
                            .files
                            .get("decoder")
                            .ok_or_else(|| "模型定义缺少 decoder".to_string())?,
                    )
                    .to_string_lossy()
                    .to_string(),
            );
            config.model_config.transducer.joiner = Some(
                model_root
                    .join(
                        model
                            .files
                            .get("joiner")
                            .ok_or_else(|| "模型定义缺少 joiner".to_string())?,
                    )
                    .to_string_lossy()
                    .to_string(),
            );
        }
        other => return Err(format!("当前模型运行时暂不支持: {other}")),
    }

    OnlineRecognizer::create(&config).ok_or_else(|| "创建 sherpa-onnx 识别器失败。".into())
}

fn create_sherpa_session(
    catalog: &Path,
    model_dir: &Path,
    state_dir: &Path,
) -> Result<SherpaSession, String> {
    let recognizer = create_sherpa_recognizer(catalog, model_dir, state_dir)?;
    let stream = recognizer.create_stream();

    Ok(SherpaSession {
        recognizer,
        stream,
        sample_rate: 16_000,
        segment: 0,
        last_text: String::new(),
    })
}

#[tauri::command]
fn check_sherpa_running(app: tauri::AppHandle) -> bool {
    let state = app.state::<DesktopState>();
    let is_running = state.sherpa_session.lock().unwrap().is_some();
    is_running
}

#[tauri::command]
fn list_sherpa_models(app: tauri::AppHandle) -> Result<Vec<SherpaModelSummary>, String> {
    let (catalog, model_dir, state_dir) = resolve_sherpa_config(&app);
    ensure_sherpa_storage(&model_dir, &state_dir)?;
    let state = app.state::<DesktopState>();
    let downloading = state.downloading_models.lock().unwrap();
    let progress = state.sherpa_download_progress.lock().unwrap();
    list_sherpa_models_from_catalog(&catalog, &model_dir, &state_dir, &downloading, &progress)
}

#[tauri::command]
fn download_sherpa_model(
    app: tauri::AppHandle,
    model_id: String,
) -> Result<Vec<SherpaModelSummary>, String> {
    let (catalog_path, model_dir, state_dir) = resolve_sherpa_config(&app);
    ensure_sherpa_storage(&model_dir, &state_dir)?;

    let state = app.state::<DesktopState>();
    let mut downloading = state.downloading_models.lock().unwrap();

    if downloading.contains(&model_id) {
        let progress = state.sherpa_download_progress.lock().unwrap();
        return list_sherpa_models_from_catalog(
            &catalog_path,
            &model_dir,
            &state_dir,
            &downloading,
            &progress,
        );
    }

    downloading.insert(model_id.clone());

    let app_clone = app.clone();
    let model_id_clone = model_id.clone();

    tauri::async_runtime::spawn(async move {
        let (catalog_path, model_dir, state_dir) = resolve_sherpa_config(&app_clone);
        let result = (|| -> Result<(), String> {
            let catalog = load_sherpa_catalog(&catalog_path)?;
            let model = find_sherpa_model(&catalog, &model_id_clone)?;
            install_sherpa_model(&app_clone, model, &model_dir, &state_dir)?;
            save_active_sherpa_model_id(&state_dir, &model.id)?;
            app_clone
                .state::<DesktopState>()
                .sherpa_session
                .lock()
                .unwrap()
                .take();
            Ok(())
        })();

        {
            let state = app_clone.state::<DesktopState>();
            let mut downloading = state.downloading_models.lock().unwrap();
            downloading.remove(&model_id_clone);
            state
                .sherpa_download_progress
                .lock()
                .unwrap()
                .remove(&model_id_clone);
        }

        match result {
            Ok(_) => {
                let _ = app_clone.emit("sherpa-model-installed", model_id_clone);
            }
            Err(err) => {
                let _ = app_clone.emit(
                    "sherpa-model-download-failed",
                    serde_json::json!({
                        "modelId": model_id_clone,
                        "error": err,
                    }),
                );
            }
        }
    });

    let progress = state.sherpa_download_progress.lock().unwrap();
    list_sherpa_models_from_catalog(
        &catalog_path,
        &model_dir,
        &state_dir,
        &downloading,
        &progress,
    )
}

#[tauri::command]
fn activate_sherpa_model(
    app: tauri::AppHandle,
    model_id: String,
) -> Result<Vec<SherpaModelSummary>, String> {
    let (catalog_path, model_dir, state_dir) = resolve_sherpa_config(&app);
    ensure_sherpa_storage(&model_dir, &state_dir)?;
    let catalog = load_sherpa_catalog(&catalog_path)?;
    let model = find_sherpa_model(&catalog, &model_id)?;
    if !is_sherpa_model_installed(&model_dir, model) {
        return Err("模型尚未下载，无法激活。".into());
    }
    save_active_sherpa_model_id(&state_dir, &model.id)?;
    app.state::<DesktopState>()
        .sherpa_session
        .lock()
        .unwrap()
        .take();
    let state = app.state::<DesktopState>();
    let downloading = state.downloading_models.lock().unwrap();
    let progress = state.sherpa_download_progress.lock().unwrap();
    list_sherpa_models_from_catalog(
        &catalog_path,
        &model_dir,
        &state_dir,
        &downloading,
        &progress,
    )
}

#[tauri::command]
fn start_sherpa_service(app: tauri::AppHandle) -> Result<String, String> {
    let (catalog, model_dir, state_dir) = resolve_sherpa_config(&app);
    ensure_sherpa_storage(&model_dir, &state_dir)?;
    let session = create_sherpa_session(&catalog, &model_dir, &state_dir)?;
    let state = app.state::<DesktopState>();
    *state.sherpa_session.lock().unwrap() = Some(session);
    Ok("direct".into())
}

#[tauri::command]
fn stop_sherpa_service(app: tauri::AppHandle) {
    let state = app.state::<DesktopState>();
    state.sherpa_session.lock().unwrap().take();
}

#[tauri::command]
fn feed_sherpa_audio(
    app: tauri::AppHandle,
    samples: Vec<i16>,
    input_finished: bool,
) -> Result<Option<SherpaRecognitionUpdate>, String> {
    let state = app.state::<DesktopState>();
    let mut session_guard = state.sherpa_session.lock().unwrap();
    let session = session_guard
        .as_mut()
        .ok_or_else(|| "Sherpa ONNX 尚未就绪，请先启动引擎。".to_string())?;

    if !samples.is_empty() {
        let float_samples = samples
            .into_iter()
            .map(|sample| sample as f32 / 32768.0)
            .collect::<Vec<_>>();
        session
            .stream
            .accept_waveform(session.sample_rate, &float_samples);
    }

    if input_finished {
        session.stream.input_finished();
    }

    let mut latest = session.recognizer.get_result(&session.stream);
    while session.recognizer.is_ready(&session.stream) {
        session.recognizer.decode(&session.stream);
        latest = session.recognizer.get_result(&session.stream);
    }

    let Some(result) = latest else {
        if input_finished {
            session.recognizer.reset(&session.stream);
            session.segment = 0;
            session.last_text.clear();
        }
        return Ok(None);
    };

    let text = result.text.trim().to_string();
    let is_final =
        result.is_final || input_finished || session.recognizer.is_endpoint(&session.stream);
    let should_emit = !text.is_empty() && (text != session.last_text || is_final);

    let update = if should_emit {
        Some(SherpaRecognitionUpdate {
            text: text.clone(),
            segment: session.segment,
            is_final: is_final,
        })
    } else {
        None
    };

    if is_final {
        session.recognizer.reset(&session.stream);
        session.segment += 1;
        session.last_text.clear();
    } else if !text.is_empty() {
        session.last_text = text;
    }

    Ok(update)
}

fn start_native_speech_bridge(app: &tauri::AppHandle) {
    let app_handle = app.clone();
    thread::spawn(move || {
        let listener = match TcpListener::bind(("127.0.0.1", DEFAULT_NATIVE_API_PORT)) {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!("Thunder native speech bridge failed to bind: {error}");
                return;
            }
        };

        for stream in listener.incoming() {
            let app_for_request = app_handle.clone();
            match stream {
                Ok(stream) => {
                    thread::spawn(move || {
                        handle_native_speech_request(app_for_request, stream);
                    });
                }
                Err(error) => eprintln!("Thunder native speech bridge connection failed: {error}"),
            }
        }
    });
}

fn handle_native_speech_request(app: tauri::AppHandle, mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(NATIVE_HTTP_READ_TIMEOUT));
    let request = match read_native_http_request(&mut stream, NATIVE_HTTP_MAX_BODY_BYTES) {
        Ok(request) => request,
        Err(error) => {
            let _ = write_native_json(
                &mut stream,
                400,
                serde_json::json!({ "ok": false, "message": error.to_string() }),
            );
            return;
        }
    };

    let Some((header, body)) = request.split_once("\r\n\r\n") else {
        let _ = write_native_json(
            &mut stream,
            400,
            serde_json::json!({ "ok": false, "message": "Invalid HTTP request" }),
        );
        return;
    };
    let mut lines = header.lines();
    let request_line = lines.next().unwrap_or_default();
    let parts = request_line.split_whitespace().collect::<Vec<_>>();
    if parts.len() < 2 {
        let _ = write_native_json(
            &mut stream,
            400,
            serde_json::json!({ "ok": false, "message": "Invalid HTTP request line" }),
        );
        return;
    }

    let method = parts[0];
    let path = parts[1].split('?').next().unwrap_or(parts[1]);
    let result = dispatch_native_speech_request(app, method, path, body);
    let (status, payload) = match result {
        Ok(data) => (200, serde_json::json!({ "ok": true, "data": data })),
        Err((status, message)) => (
            status,
            serde_json::json!({ "ok": false, "message": message }),
        ),
    };
    let _ = write_native_json(&mut stream, status, payload);
}

fn read_native_http_request<R: Read>(reader: &mut R, max_body_bytes: usize) -> io::Result<String> {
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 8192];
    let mut expected_total_len = None;

    loop {
        let bytes_read = reader.read(&mut chunk)?;
        if bytes_read == 0 {
            break;
        }

        buffer.extend_from_slice(&chunk[..bytes_read]);

        if expected_total_len.is_none() {
            if let Some(header_end) = find_http_header_end(&buffer) {
                let header = String::from_utf8_lossy(&buffer[..header_end]);
                let body_len = parse_http_content_length(&header)?;
                if body_len > max_body_bytes {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "Native bridge request body is too large",
                    ));
                }
                expected_total_len = Some(header_end + 4 + body_len);
            }
        }

        if let Some(total_len) = expected_total_len {
            if buffer.len() >= total_len {
                buffer.truncate(total_len);
                break;
            }
        }
    }

    String::from_utf8(buffer).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

fn find_http_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

fn parse_http_content_length(header: &str) -> io::Result<usize> {
    for line in header.lines().skip(1) {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };

        if name.trim().eq_ignore_ascii_case("content-length") {
            return value.trim().parse::<usize>().map_err(|error| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("Invalid Content-Length header: {error}"),
                )
            });
        }
    }

    Ok(0)
}

fn dispatch_native_speech_request(
    app: tauri::AppHandle,
    method: &str,
    path: &str,
    body: &str,
) -> Result<serde_json::Value, (u16, String)> {
    match (method, path) {
        ("GET", "/health") => Ok(serde_json::json!({ "status": "ok" })),
        ("GET", "/platform") => Ok(serde_json::json!(get_desktop_platform())),
        ("GET", "/sherpa/status") => Ok(serde_json::json!(check_sherpa_running(app))),
        ("GET", "/sherpa/models") => list_sherpa_models(app)
            .map(|value| serde_json::json!(value))
            .map_err(|message| (500, message)),
        ("POST", "/sherpa/models/download") => {
            let request = parse_native_json::<NativeModelRequest>(body)?;
            download_sherpa_model(app, request.model_id)
                .map(|value| serde_json::json!(value))
                .map_err(|message| (500, message))
        }
        ("POST", "/sherpa/models/activate") => {
            let request = parse_native_json::<NativeModelRequest>(body)?;
            activate_sherpa_model(app, request.model_id)
                .map(|value| serde_json::json!(value))
                .map_err(|message| (500, message))
        }
        ("POST", "/sherpa/start") => start_sherpa_service(app)
            .map(|value| serde_json::json!(value))
            .map_err(|message| (500, message)),
        ("POST", "/sherpa/stop") => {
            stop_sherpa_service(app);
            Ok(serde_json::Value::Null)
        }
        ("POST", "/sherpa/feed") => {
            let request = parse_native_json::<NativeSherpaFeedRequest>(body)?;
            feed_sherpa_audio(
                app,
                request.samples,
                request.input_finished.unwrap_or(false),
            )
            .map(|value| serde_json::json!(value))
            .map_err(|message| (500, message))
        }
        _ => Err((404, "Unknown native speech bridge route".into())),
    }
}

fn parse_native_json<T: for<'de> Deserialize<'de>>(body: &str) -> Result<T, (u16, String)> {
    serde_json::from_str(body.trim()).map_err(|error| (400, format!("Invalid JSON body: {error}")))
}

fn write_native_json(
    stream: &mut TcpStream,
    status: u16,
    payload: serde_json::Value,
) -> io::Result<()> {
    let body = payload.to_string();
    let status_text = if status == 200 { "OK" } else { "Error" };
    write!(
        stream,
        "HTTP/1.1 {status} {status_text}\r\ncontent-type: application/json; charset=utf-8\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
        body.as_bytes().len(),
        body
    )
}

#[cfg(test)]
mod tests {
    use super::{read_native_http_request, NATIVE_HTTP_MAX_BODY_BYTES};
    use std::io::Cursor;

    #[test]
    fn native_http_reader_preserves_large_json_body() {
        let body = serde_json::json!({
            "samples": vec![123_i16; 4096],
            "inputFinished": false,
        })
        .to_string();
        assert!(body.len() > 8192);

        let request = format!(
            "POST /sherpa/feed HTTP/1.1\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{}",
            body.len(),
            body
        );
        let mut cursor = Cursor::new(request.into_bytes());

        let parsed = read_native_http_request(&mut cursor, NATIVE_HTTP_MAX_BODY_BYTES).unwrap();

        assert_eq!(parsed.split_once("\r\n\r\n").unwrap().1, body);
    }

    #[test]
    fn native_http_reader_rejects_oversized_body() {
        let request = "POST /sherpa/feed HTTP/1.1\r\ncontent-length: 4\r\n\r\nnull";
        let mut cursor = Cursor::new(request.as_bytes());

        let error = read_native_http_request(&mut cursor, 3).unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(DesktopState {
            is_quitting: AtomicBool::new(false),
            sidecars: Mutex::new(Vec::new()),
            sherpa_session: Mutex::new(None),
            downloading_models: Mutex::new(HashSet::new()),
            sherpa_download_progress: Mutex::new(HashMap::new()),
            #[cfg(target_os = "windows")]
            job: WindowsJob::new().ok(),
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_decorum::init())
        .invoke_handler(tauri::generate_handler![
            get_desktop_platform,
            check_sherpa_running,
            list_sherpa_models,
            download_sherpa_model,
            activate_sherpa_model,
            start_sherpa_service,
            stop_sherpa_service,
            feed_sherpa_audio,
        ])
        .setup(|app| {
            start_native_speech_bridge(&app.handle());
            start_local_runtime(&app.handle())?;
            build_tray(&app.handle())?;

            #[cfg(any(target_os = "windows", target_os = "macos"))]
            if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                main_window.create_overlay_titlebar()?;
                #[cfg(target_os = "macos")]
                main_window.set_traffic_lights_inset(12.0, 16.0)?;
            }

            if let Err(error) = register_desktop_shortcut(&app.handle()) {
                eprintln!("Thunder desktop shortcut was not registered: {}", error);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.app_handle().state::<DesktopState>();

                if !state.is_quitting.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                    let _ = window
                        .app_handle()
                        .emit("thunder://desktop-window-hidden", "tray");
                }
            }
        })
        // decorum 插件的 titlebar 按钮是在 `DOMContentLoaded` 触发前通过 `eval`
        // 注入的脚本里注册回调来创建的，F5 刷新时 webview 重载，IPC 注入会被
        // 延后到 `DOMContentLoaded` 之后，导致按钮 DOM 不再被重建。
        // 这里在每次主窗口页面开始加载时重新调用一次 `create_overlay_titlebar`，
        // 让 decorum 重新注入脚本，保证刷新后 min/max/close 按钮仍然存在。
        .on_page_load(|webview, payload| {
            if webview.label() != MAIN_WINDOW_LABEL {
                return;
            }
            if !matches!(payload.event, tauri::PageLoadEvent::Started) {
                return;
            }
            #[cfg(any(target_os = "windows", target_os = "macos"))]
            {
                use tauri_plugin_decorum::WebviewWindowExt;
                let _ = webview.create_overlay_titlebar();
                #[cfg(target_os = "macos")]
                let _ = webview.set_traffic_lights_inset(12.0, 16.0);
            }
        });

    // The updater plugin requires a non-null `plugins.updater` config.
    // Dev runs use the base tauri.conf without release updater settings,
    // so only enable the plugin for packaged production builds.
    if !cfg!(debug_assertions) {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building Thunder desktop shell");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            kill_sidecars(app_handle);
        }
    });
}
