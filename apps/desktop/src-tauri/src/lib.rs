use std::{
    collections::HashMap,
    fs,
    io,
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

use serde::Deserialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_SHOW_ID: &str = "tray-show";
const TRAY_HIDE_ID: &str = "tray-hide";
const TRAY_QUIT_ID: &str = "tray-quit";
const DESKTOP_SHORTCUT: &str = "CommandOrControl+Shift+T";
const DESKTOP_ENV_FILE_NAME: &str = "desktop.env";

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RuntimeManifest {
    web_port: u16,
    api_port: u16,
    web_entry: String,
    api_entry: String,
    node_entry: String,
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

fn read_runtime_manifest<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<(RuntimeManifest, PathBuf)> {
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
    if cfg!(dev) {
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
    println!("Thunder desktop runtime ready on http://{}", localhost_web_host);

    Ok(())
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
        .setup(|app| {
            start_local_runtime(&app.handle())?;
            build_tray(&app.handle())?;
            register_desktop_shortcut(&app.handle())
                .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })?;
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
