use std::{
    collections::HashMap,
    fs, io,
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

use serde::{Deserialize, Serialize};
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
const DEFAULT_SHERPA_PORT: u16 = 10096;
const DEFAULT_SHERPA_HOST: &str = "127.0.0.1";

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
    installed: bool,
    active: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SherpaModelCatalogEntry {
    id: String,
    name: String,
    description: String,
    language: String,
    runtime: String,
    archive_root: String,
    files: HashMap<String, String>,
}

#[derive(Deserialize)]
struct SherpaActiveModelState {
    id: Option<String>,
}

struct DesktopState {
    is_quitting: AtomicBool,
    sidecars: Mutex<Vec<Child>>,
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

fn resolve_sherpa_paths<R: Runtime>(app: &AppHandle<R>) -> (PathBuf, PathBuf, PathBuf, PathBuf) {
    if cfg!(debug_assertions) {
        let workspace = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("..");
        let service_root = workspace.join("services").join("sherpa-onnx");
        let launcher = service_root.join("start_sherpa_onnx.py");
        let manager = service_root.join("manage_models.py");
        let catalog = service_root.join("model-catalog.json");
        return (launcher, manager, catalog, service_root);
    }

    let resource_dir = app.path().resource_dir().unwrap_or_default();
    let service_root = resource_dir.join("runtime").join("services").join("sherpa-onnx");
    let launcher = service_root.join("start_sherpa_onnx.py");
    let manager = service_root.join("manage_models.py");
    let catalog = service_root.join("model-catalog.json");
    (launcher, manager, catalog, service_root)
}

fn resolve_sherpa_config<R: Runtime>(
    app: &AppHandle<R>,
) -> (PathBuf, PathBuf, PathBuf, String, String, u16, PathBuf, PathBuf) {
    let desktop_env = load_desktop_env(app).unwrap_or_default();
    let (launcher, manager, catalog, service_root) = resolve_sherpa_paths(app);

    let port = desktop_env
        .get("THUNDER_SHERPA_PORT")
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(DEFAULT_SHERPA_PORT);

    let host = desktop_env
        .get("THUNDER_SHERPA_HOST")
        .cloned()
        .unwrap_or_else(|| DEFAULT_SHERPA_HOST.into());

    let python = desktop_env
        .get("THUNDER_SHERPA_PYTHON")
        .cloned()
        .unwrap_or_else(|| {
            let venv = service_root.join(".venv");
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

    (
        launcher, manager, catalog, python, host, port, model_dir, state_dir,
    )
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
) -> Result<Vec<SherpaModelSummary>, String> {
    let entries = load_sherpa_catalog(catalog)?;
    let active_model_id = load_active_sherpa_model_id(state_dir);
    let mut models = entries
        .into_iter()
        .map(|entry| {
            let installed = is_sherpa_model_installed(model_dir, &entry);
            SherpaModelSummary {
                active: installed && active_model_id.as_deref() == Some(entry.id.as_str()),
                id: entry.id,
                name: entry.name,
                description: entry.description,
                language: entry.language,
                runtime: entry.runtime,
                installed,
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

fn run_python_json_command(
    python: &str,
    script: &Path,
    args: &[String],
) -> Result<String, String> {
    let output = Command::new(python)
        .arg(script)
        .args(args)
        .output()
        .map_err(|e| {
            if e.kind() == io::ErrorKind::NotFound {
                format!("未找到 Python 可执行文件 ({python})。")
            } else {
                format!("执行 Python 脚本失败: {e}")
            }
        })?;

    if output.status.success() {
        return String::from_utf8(output.stdout)
            .map(|text| text.trim().to_string())
            .map_err(|e| format!("Python 输出不是合法 UTF-8: {e}"));
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err(format!("Python 脚本执行失败，退出码: {}", output.status))
    } else {
        Err(stderr)
    }
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
        state.sidecars.lock().unwrap().push(child);
    }

    wait_for_port(port, Duration::from_secs(120))
        .map_err(|_| "FunASR 服务启动超时，请检查 Python 环境和依赖是否正确安装。".to_string())?;

    Ok(format!("ws://{}:{}", host, port))
}

#[tauri::command]
fn check_sherpa_running(app: tauri::AppHandle) -> bool {
    let (_, _, _, _, _, port, _, _) = resolve_sherpa_config(&app);
    is_port_open(port)
}

#[tauri::command]
fn list_sherpa_models(app: tauri::AppHandle) -> Result<Vec<SherpaModelSummary>, String> {
    let (_, manager, catalog, python, _, _, model_dir, state_dir) = resolve_sherpa_config(&app);
    ensure_sherpa_storage(&model_dir, &state_dir)?;
    if catalog.exists() {
        return list_sherpa_models_from_catalog(&catalog, &model_dir, &state_dir);
    }

    let args = vec![
        "list".to_string(),
        "--catalog".to_string(),
        catalog.to_string_lossy().to_string(),
        "--model-dir".to_string(),
        model_dir.to_string_lossy().to_string(),
        "--state-dir".to_string(),
        state_dir.to_string_lossy().to_string(),
    ];
    let json = run_python_json_command(&python, &manager, &args)?;
    serde_json::from_str(&json).map_err(|e| format!("解析 sherpa 模型列表失败: {e}"))
}

#[tauri::command]
fn download_sherpa_model(
    app: tauri::AppHandle,
    model_id: String,
) -> Result<Vec<SherpaModelSummary>, String> {
    let (_, manager, catalog, python, _, _, model_dir, state_dir) = resolve_sherpa_config(&app);
    ensure_sherpa_storage(&model_dir, &state_dir)?;
    let args = vec![
        "download".to_string(),
        "--catalog".to_string(),
        catalog.to_string_lossy().to_string(),
        "--model-dir".to_string(),
        model_dir.to_string_lossy().to_string(),
        "--state-dir".to_string(),
        state_dir.to_string_lossy().to_string(),
        "--model-id".to_string(),
        model_id,
    ];

    let json = run_python_json_command(&python, &manager, &args)?;

    serde_json::from_str(&json).map_err(|e| format!("解析下载后的 sherpa 模型状态失败: {e}"))
}

#[tauri::command]
fn activate_sherpa_model(
    app: tauri::AppHandle,
    model_id: String,
) -> Result<Vec<SherpaModelSummary>, String> {
    let (_, manager, catalog, python, _, _, model_dir, state_dir) = resolve_sherpa_config(&app);
    ensure_sherpa_storage(&model_dir, &state_dir)?;
    let args = vec![
        "activate".to_string(),
        "--catalog".to_string(),
        catalog.to_string_lossy().to_string(),
        "--model-dir".to_string(),
        model_dir.to_string_lossy().to_string(),
        "--state-dir".to_string(),
        state_dir.to_string_lossy().to_string(),
        "--model-id".to_string(),
        model_id,
    ];

    let json = run_python_json_command(&python, &manager, &args)?;

    serde_json::from_str(&json).map_err(|e| format!("解析激活后的 sherpa 模型状态失败: {e}"))
}

#[tauri::command]
fn start_sherpa_service(app: tauri::AppHandle) -> Result<String, String> {
    let (launcher, _, _, python, host, port, model_dir, state_dir) = resolve_sherpa_config(&app);
    ensure_sherpa_storage(&model_dir, &state_dir)?;

    if is_port_open(port) {
        return Ok(format!("ws://{}:{}", host, port));
    }

    if !launcher.exists() {
        return Err("Sherpa ONNX 启动脚本不存在，请检查是否已安装服务文件。".into());
    }

    let cwd = launcher
        .parent()
        .unwrap_or(Path::new("."))
        .to_path_buf();

    let mut envs = HashMap::new();
    envs.insert("THUNDER_SHERPA_HOST".into(), host.clone());
    envs.insert("THUNDER_SHERPA_PORT".into(), port.to_string());
    envs.insert(
        "THUNDER_SHERPA_MODEL_DIR".into(),
        model_dir.to_string_lossy().to_string(),
    );
    envs.insert(
        "THUNDER_SHERPA_STATE_DIR".into(),
        state_dir.to_string_lossy().to_string(),
    );

    let child = spawn_python_process(&python, &launcher, &cwd, &envs).map_err(|e| {
        if e.kind() == io::ErrorKind::NotFound {
            format!("未找到 Python 可执行文件 ({python})。请先安装 Python 并配置 sherpa-onnx 环境。")
        } else {
            format!("Sherpa ONNX 进程启动失败: {e}")
        }
    })?;

    {
        let state = app.state::<DesktopState>();
        state.sidecars.lock().unwrap().push(child);
    }

    wait_for_port(port, Duration::from_secs(120))
        .map_err(|_| "Sherpa ONNX 服务启动超时，请检查 Python 环境、依赖和已激活模型。".to_string())?;

    Ok(format!("ws://{}:{}", host, port))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(DesktopState {
            is_quitting: AtomicBool::new(false),
            sidecars: Mutex::new(Vec::new()),
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
