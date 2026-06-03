use std::{
    io,
    path::{Path, PathBuf},
};

pub fn collect_runtime_root_candidates(
    resource_dir: Option<&Path>,
    executable_path: Option<&Path>,
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(resource_dir) = resource_dir {
        candidates.push(resource_dir.join("runtime"));
        candidates.push(resource_dir.join("_up_").join("runtime"));
    }

    if let Some(executable_dir) = executable_path.and_then(Path::parent) {
        candidates.push(executable_dir.join("runtime"));
        candidates.push(executable_dir.join("_up_").join("runtime"));
    }

    let mut deduped = Vec::new();
    for candidate in candidates {
        if !deduped
            .iter()
            .any(|existing: &PathBuf| existing == &candidate)
        {
            deduped.push(candidate);
        }
    }

    deduped
}

pub fn resolve_runtime_root_from_candidates(candidates: &[PathBuf]) -> io::Result<PathBuf> {
    if let Some(runtime_root) = candidates
        .iter()
        .find(|candidate| candidate.join("manifest.json").exists())
    {
        return Ok(runtime_root.clone());
    }

    let searched_paths = candidates
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");

    Err(io::Error::new(
        io::ErrorKind::NotFound,
        format!("desktop runtime manifest not found. searched: {searched_paths}"),
    ))
}

#[cfg(target_os = "windows")]
pub fn normalize_path_for_child_process(path: &Path) -> PathBuf {
    // Rust/Win32 可以接受 verbatim path，但部分子进程运行时（例如 Node）在入口脚本解析上不稳定。
    // 这里只在“跨进程边界”把路径收敛为常规 Win32 形式，内部仍保留 PathBuf 原生语义。
    let raw = path.to_string_lossy();

    if let Some(stripped) = raw.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{stripped}"));
    }

    if let Some(stripped) = raw.strip_prefix(r"\\?\") {
        return PathBuf::from(stripped);
    }

    path.to_path_buf()
}

#[cfg(not(target_os = "windows"))]
pub fn normalize_path_for_child_process(path: &Path) -> PathBuf {
    // 非 Windows 平台不需要额外兼容层，保持原路径即可。
    path.to_path_buf()
}

#[cfg(test)]
mod tests {
    use super::{
        collect_runtime_root_candidates, normalize_path_for_child_process,
        resolve_runtime_root_from_candidates,
    };
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    fn unique_temp_dir(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("thunder-{label}-{unique}"))
    }

    #[test]
    fn collects_runtime_candidates_for_resource_and_executable_layouts() {
        let resource_dir = Path::new(r"C:\Program Files\Thunder");
        let executable_path =
            Path::new(r"C:\Users\alice\AppData\Local\Thunder\thunder-desktop.exe");

        let candidates = collect_runtime_root_candidates(Some(resource_dir), Some(executable_path));

        assert_eq!(
            candidates,
            vec![
                PathBuf::from(r"C:\Program Files\Thunder\runtime"),
                PathBuf::from(r"C:\Program Files\Thunder\_up_\runtime"),
                PathBuf::from(r"C:\Users\alice\AppData\Local\Thunder\runtime"),
                PathBuf::from(r"C:\Users\alice\AppData\Local\Thunder\_up_\runtime"),
            ]
        );
    }

    #[test]
    fn resolves_first_runtime_root_with_manifest() {
        let root = unique_temp_dir("runtime-root");
        let first = root.join("first").join("runtime");
        let second = root.join("second").join("runtime");

        fs::create_dir_all(&first).expect("create first runtime root");
        fs::create_dir_all(&second).expect("create second runtime root");
        fs::write(second.join("manifest.json"), "{}").expect("write runtime manifest");

        let resolved = resolve_runtime_root_from_candidates(&[first, second.clone()])
            .expect("resolve runtime root");

        assert_eq!(resolved, second);

        let _ = fs::remove_dir_all(root);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn normalizes_verbatim_drive_paths_for_child_processes() {
        let normalized = normalize_path_for_child_process(Path::new(
            r"\\?\C:\Users\wangc\AppData\Local\Thunder\_up_\runtime\api\server.cjs",
        ));

        assert_eq!(
            normalized,
            PathBuf::from(r"C:\Users\wangc\AppData\Local\Thunder\_up_\runtime\api\server.cjs")
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn normalizes_verbatim_unc_paths_for_child_processes() {
        let normalized =
            normalize_path_for_child_process(Path::new(r"\\?\UNC\server\share\Thunder\runtime"));

        assert_eq!(normalized, PathBuf::from(r"\\server\share\Thunder\runtime"));
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn keeps_posix_paths_unchanged_for_child_processes() {
        let path = Path::new("/Applications/Thunder.app/Contents/Resources/runtime");
        let normalized = normalize_path_for_child_process(path);

        assert_eq!(normalized, PathBuf::from(path));
    }
}
