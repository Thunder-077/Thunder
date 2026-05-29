use std::{
    collections::{HashMap, HashSet},
    fs,
    fs::File,
    io::{self, BufReader, Read, Write},
    net::{TcpStream, ToSocketAddrs},
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
use sherpa_onnx::{OnlineRecognizer, OnlineRecognizerConfig, OnlineStream};
use serde::{Deserialize, Serialize};
use tar::Archive;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, WebviewWindow, WindowEvent,
};
use tauri_plugin_decorum::WebviewWindowExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_SHOW_ID: &str = "tray-show";
const TRAY_HIDE_ID: &str = "tray-hide";
const TRAY_QUIT_ID: &str = "tray-quit";
const DESKTOP_SHORTCUT: &str = "CommandOrControl+Shift+T";
const DESKTOP_ENV_FILE_NAME: &str = "desktop.env";
const DEFAULT_FUNASR_PORT: u16 = 10095;
const DEFAULT_FUNASR_HOST: &str = "127.0.0.1";

#[allow(dead_code)]
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RuntimeManifest {
    web_port: u16,
    api_port: u16,
    funasr_port: Option<u16>,
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
            fn CreateJobObjectW(lpJobAttributes: *mut std::ffi::c_void, lpName: *const u16) -> *mut std::ffi::c_void;
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
            fn AssignProcessToJobObject(hJob: *mut std::ffi::c_void, hProcess: *mut std::ffi::c_void) -> i32;
        }

        let process_handle = child.as_raw_handle();
        let res = unsafe { AssignProcessToJobObject(self.handle, process_handle as *mut std::ffi::c_void) };
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

fn read_runtime_manifest<R: Runtime>(
    app: &AppHandle<R>,
) -> tauri::Result<(RuntimeManifest, PathBuf)> {
    let resource_dir = app.path().resource_dir()?;
    let manifest_path = resource_dir.join("runtime").join("manifest.json");
    let manifest = serde_json::from_str::<RuntimeManifest>(&fs::read_to_string(&manifest_path)?)?;
    Ok((manifest, resource_dir))
}

fn spawn_node_process(
    node_path: &Path,
    entry_path: &Path,
    cwd: &Path,
    envs: &HashMap<String, String>,
) -> io::Result<Child> {
    let mut command = Command::new(node_path);
    command
        .arg(entry_path)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    for (key, value) in envs {
        command.env(key, value);
    }

    command.spawn()
}

fn spawn_python_process(
    python_path: &str,
    launcher_path: &Path,
    cwd: &Path,
    envs: &HashMap<String, String>,
) -> io::Result<Child> {
    let mut command = Command::new(python_path);
    command
        .arg(launcher_path)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    for (key, value) in envs {
        command.env(key, value);
    }

    command.spawn()
}

fn is_port_open(port: u16) -> bool {
    let Ok(mut addrs) = ("127.0.0.1", port).to_socket_addrs() else {
        return false;
    };

    let Some(addr) = addrs.next() else {
        return false;
    };

    TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok()
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

    let (manifest, resource_dir) = read_runtime_manifest(app)?;
    let mut desktop_env = load_desktop_env(app)?;
    let localhost_api_url = format!("http://127.0.0.1:{}", manifest.api_port);
    let localhost_web_host = format!("127.0.0.1:{}", manifest.web_port);

    desktop_env
        .entry("HOSTNAME".into())
        .or_insert_with(|| "127.0.0.1".into());
    desktop_env.insert("API_PORT".into(), manifest.api_port.to_string());
    desktop_env.insert("API_URL".into(), localhost_api_url.clone());

    let web_env = {
        let mut env = desktop_env.clone();
        env.insert("PORT".into(), manifest.web_port.to_string());
        env.insert("HOSTNAME".into(), "127.0.0.1".into());
        env
    };
    let api_env = desktop_env;

    let node_path = resource_dir.join("runtime").join(&manifest.node_entry);
    let web_entry = resource_dir.join("runtime").join(&manifest.web_entry);
    let api_entry = resource_dir.join("runtime").join(&manifest.api_entry);
    let runtime_root = resource_dir.join("runtime");

    let api_child = spawn_node_process(&node_path, &api_entry, &runtime_root, &api_env)?;
    let web_child = spawn_node_process(&node_path, &web_entry, &runtime_root, &web_env)?;

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

    wait_for_port(manifest.api_port, Duration::from_secs(30))?;
    wait_for_port(manifest.web_port, Duration::from_secs(30))?;
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

fn resolve_funasr_config<R: Runtime>(app: &AppHandle<R>) -> (PathBuf, String, String, u16) {
    let desktop_env = load_desktop_env(app).unwrap_or_default();

    let port = desktop_env
        .get("THUNDER_FUNASR_PORT")
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(DEFAULT_FUNASR_PORT);

    let host = desktop_env
        .get("THUNDER_FUNASR_HOST")
        .cloned()
        .unwrap_or_else(|| DEFAULT_FUNASR_HOST.into());

    if cfg!(debug_assertions) {
        let workspace = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("..");

        let launcher = workspace
            .join("services")
            .join("funasr")
            .join("start_funasr.py");

        let python = desktop_env
            .get("THUNDER_FUNASR_PYTHON")
            .cloned()
            .unwrap_or_else(|| {
                let venv = workspace.join("services").join("funasr").join(".venv");
                let bin = if cfg!(target_os = "windows") {
                    venv.join("Scripts").join("python.exe")
                } else {
                    venv.join("bin").join("python")
                };
                if bin.exists() {
                    bin.to_string_lossy().into()
                } else {
                    "python".into()
                }
            });

        (launcher, python, host, port)
    } else {
        let resource_dir = app.path().resource_dir().unwrap_or_default();
        let launcher = resource_dir
            .join("runtime")
            .join("services")
            .join("funasr")
            .join("start_funasr.py");

        let python = desktop_env
            .get("THUNDER_FUNASR_PYTHON")
            .cloned()
            .unwrap_or_else(|| "python".into());

        (launcher, python, host, port)
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

    let resource_dir = app.path().resource_dir().unwrap_or_default();
    let service_root = resource_dir.join("runtime").join("services").join("sherpa-onnx");
    service_root.join("model-catalog.json")
}

fn resolve_sherpa_config<R: Runtime>(
    app: &AppHandle<R>,
) -> (PathBuf, PathBuf, PathBuf) {
    let catalog = resolve_sherpa_catalog_path(app);
    let app_data_root = app.path().app_data_dir().unwrap_or_else(|_| {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("..")
            .join(".thunder")
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
    let content = fs::read_to_string(catalog)
        .map_err(|e| format!("读取 sherpa 模型目录失败: {e}"))?;
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
    fs::write(
        state_dir.join("active-model.json"),
        format!("{content}\n"),
    )
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
) -> Result<Vec<SherpaModelSummary>, String> {
    let entries = load_sherpa_catalog(catalog)?;
    let active_model_id = load_active_sherpa_model_id(state_dir);
    let mut models = entries
        .into_iter()
        .map(|entry| {
            let installed = is_sherpa_model_installed(model_dir, &entry);
            let downloading = downloading_models.contains(&entry.id);
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
    let mut file = File::create(&archive_path)
        .map_err(|e| format!("创建 sherpa 模型临时文件失败: {e}"))?;
    
    let mut buffer = [0; 65536];
    let mut downloaded_bytes = 0u64;
    let mut last_percentage = 0u32;
    
    let _ = app.emit("sherpa-download-progress", serde_json::json!({
        "modelId": model.id,
        "percentage": 0,
        "downloaded": 0,
        "total": total_bytes,
        "status": "downloading",
    }));

    loop {
        let bytes_read = reader.read(&mut buffer)
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
                let _ = app.emit("sherpa-download-progress", serde_json::json!({
                    "modelId": model.id,
                    "percentage": percentage,
                    "downloaded": downloaded_bytes,
                    "total": total_bytes,
                    "status": "downloading",
                }));
            }
            
            if downloaded_bytes >= total_bytes {
                break;
            }
        }
    }
    
    file.sync_all().map_err(|e| format!("刷新数据到磁盘失败: {e}"))?;
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
    
    // 发送正在解压状态事件
    let _ = app.emit("sherpa-download-progress", serde_json::json!({
        "modelId": model.id,
        "percentage": 100,
        "downloaded": 0,
        "total": 0,
        "status": "extracting",
    }));

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
fn check_funasr_running(app: tauri::AppHandle) -> bool {
    let (_, _, _, port) = resolve_funasr_config(&app);
    is_port_open(port)
}

#[tauri::command]
fn start_funasr_service(app: tauri::AppHandle) -> Result<String, String> {
    let (launcher, python, host, port) = resolve_funasr_config(&app);

    // 已在运行则直接返回
    if is_port_open(port) {
        return Ok(format!("ws://{}:{}", host, port));
    }

    if !launcher.exists() {
        return Err("FunASR 启动脚本不存在，请检查是否已安装 FunASR 服务。".into());
    }

    let cwd = launcher
        .parent()
        .unwrap_or(Path::new("."))
        .to_path_buf();

    let mut envs = HashMap::new();
    envs.insert("THUNDER_FUNASR_HOST".into(), host.clone());
    envs.insert("THUNDER_FUNASR_PORT".into(), port.to_string());

    let child = spawn_python_process(&python, &launcher, &cwd, &envs)
        .map_err(|e| {
            if e.kind() == io::ErrorKind::NotFound {
                format!(
                    "未找到 Python 可执行文件 ({python})。请安装 Python 并配置 FunASR 环境后重试。"
                )
            } else {
                format!("FunASR 进程启动失败: {e}")
            }
        })?;

    {
        let state = app.state::<DesktopState>();

        #[cfg(target_os = "windows")]
        if let Some(ref job) = state.job {
            let _ = job.assign(&child);
        }

        state.sidecars.lock().unwrap().push(child);
    }

    wait_for_port(port, Duration::from_secs(120))
        .map_err(|_| "FunASR 服务启动超时，请检查 Python 环境和依赖是否正确安装。".to_string())?;

    Ok(format!("ws://{}:{}", host, port))
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
    list_sherpa_models_from_catalog(&catalog, &model_dir, &state_dir, &downloading)
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
        return list_sherpa_models_from_catalog(&catalog_path, &model_dir, &state_dir, &downloading);
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
            app_clone.state::<DesktopState>()
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
        }

        match result {
            Ok(_) => {
                let _ = app_clone.emit("sherpa-model-installed", model_id_clone);
            }
            Err(err) => {
                let _ = app_clone.emit("sherpa-model-download-failed", serde_json::json!({
                    "modelId": model_id_clone,
                    "error": err,
                }));
            }
        }
    });

    list_sherpa_models_from_catalog(&catalog_path, &model_dir, &state_dir, &downloading)
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
    list_sherpa_models_from_catalog(&catalog_path, &model_dir, &state_dir, &downloading)
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
        session.stream.accept_waveform(session.sample_rate, &float_samples);
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
    let is_final = result.is_final || input_finished || session.recognizer.is_endpoint(&session.stream);
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(DesktopState {
            is_quitting: AtomicBool::new(false),
            sidecars: Mutex::new(Vec::new()),
            sherpa_session: Mutex::new(None),
            downloading_models: Mutex::new(HashSet::new()),
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
            check_funasr_running,
            start_funasr_service,
            check_sherpa_running,
            list_sherpa_models,
            download_sherpa_model,
            activate_sherpa_model,
            start_sherpa_service,
            stop_sherpa_service,
            feed_sherpa_audio,
        ])
        .setup(|app| {
            start_local_runtime(&app.handle())?;
            build_tray(&app.handle())?;

            if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                #[cfg(any(target_os = "windows", target_os = "macos"))]
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
