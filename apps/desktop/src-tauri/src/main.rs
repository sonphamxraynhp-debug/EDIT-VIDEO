// AI Video Factory – vỏ desktop Tauri.
// Khởi động API (uvicorn, 127.0.0.1:8765) + worker Python của dự án, chờ /system/health rồi mở giao diện.
// Thư mục dự án lấy theo thứ tự: biến môi trường AVF_ROOT → file cấu hình root.txt → đường dẫn lúc build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent};

const HOST: &str = "127.0.0.1:8765";
const BUILD_ROOT: &str = env!("AVF_BUILD_ROOT");

struct Children(Mutex<Vec<Child>>);

fn config_file() -> Option<PathBuf> {
    if cfg!(windows) {
        return std::env::var_os("APPDATA").map(|h| PathBuf::from(h).join("AIVideoFactory/root.txt"));
    }
    std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support/AIVideoFactory/root.txt"))
}

fn project_root() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(p) = std::env::var("AVF_ROOT") {
        candidates.push(PathBuf::from(p));
    }
    if let Some(f) = config_file() {
        if let Ok(s) = std::fs::read_to_string(f) {
            candidates.push(PathBuf::from(s.trim()));
        }
    }
    candidates.push(PathBuf::from(BUILD_ROOT));
    candidates.into_iter().find(|p| p.join("services/api/avf/main.py").exists())
}

fn python(root: &Path) -> PathBuf {
    let venv = if cfg!(windows) { root.join(".venv/Scripts/python.exe") } else { root.join(".venv/bin/python") };
    if venv.exists() { venv } else { PathBuf::from(if cfg!(windows) { "python" } else { "python3" }) }
}

fn healthy() -> bool {
    let Ok(mut s) = TcpStream::connect_timeout(&HOST.parse().unwrap(), Duration::from_millis(400)) else { return false };
    let _ = s.set_read_timeout(Some(Duration::from_secs(2)));
    if s.write_all(b"GET /api/v1/system/health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n").is_err() {
        return false;
    }
    let mut buf = String::new();
    let _ = s.read_to_string(&mut buf);
    buf.starts_with("HTTP/1.1 200") || buf.starts_with("HTTP/1.0 200")
}

fn spawn(root: &Path, args: &[&str], log: &str) -> std::io::Result<Child> {
    let logs = root.join("data/logs");
    let _ = std::fs::create_dir_all(&logs);
    let out = std::fs::OpenOptions::new().create(true).append(true).open(logs.join(log))?;
    // App mở từ Finder không có PATH của shell: thêm Homebrew để tìm ffmpeg/ollama/whisper-cli/tesseract
    let path = if cfg!(windows) {
        std::env::var("PATH").unwrap_or_default()
    } else {
        format!("/opt/homebrew/bin:/usr/local/bin:{}", std::env::var("PATH").unwrap_or_default())
    };
    Command::new(python(root))
        .args(args)
        .current_dir(root)
        .env("PYTHONPATH", root.join("services/api"))
        .env("PATH", path)
        .stdout(Stdio::from(out.try_clone()?))
        .stderr(Stdio::from(out))
        .spawn()
}

fn show_error(app: &tauri::AppHandle, msg: &str) {
    if let Some(w) = app.get_webview_window("main") {
        let js = format!(
            "document.getElementById('msg').textContent='Không khởi động được dịch vụ local';\
             document.getElementById('bar').style.display='none';\
             var e=document.getElementById('err');e.style.display='block';e.textContent={:?};",
            msg
        );
        let _ = w.eval(&js);
    }
}

fn main() {
    let app = tauri::Builder::default()
        .manage(Children(Mutex::new(Vec::new())))
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                if !healthy() {
                    let Some(root) = project_root() else {
                        show_error(&handle, &format!(
                            "Không tìm thấy thư mục dự án AI Video Factory. Đặt biến AVF_ROOT hoặc ghi đường dẫn vào {:?}.",
                            config_file().unwrap_or_default()));
                        return;
                    };
                    let state = handle.state::<Children>();
                    let mut kids = state.0.lock().unwrap();
                    match spawn(&root, &["-m", "uvicorn", "avf.main:app", "--host", "127.0.0.1", "--port", "8765"], "api.stdout") {
                        Ok(c) => kids.push(c),
                        Err(e) => { show_error(&handle, &format!("Lỗi chạy Python API: {e}")); return; }
                    }
                    match spawn(&root, &["-m", "avf.worker"], "worker.stdout") {
                        Ok(c) => kids.push(c),
                        Err(e) => { show_error(&handle, &format!("Lỗi chạy worker: {e}")); return; }
                    }
                    drop(kids);
                    let start = Instant::now();
                    while !healthy() {
                        if start.elapsed() > Duration::from_secs(60) {
                            show_error(&handle, &format!("API không phản hồi sau 60 giây. Xem log: {}",
                                root.join("data/logs/api.stdout").display()));
                            return;
                        }
                        std::thread::sleep(Duration::from_millis(400));
                    }
                }
                if let Some(w) = handle.get_webview_window("main") {
                    let _ = w.navigate(format!("http://{HOST}/").parse().unwrap());
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("không khởi tạo được ứng dụng Tauri");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            // Chỉ tắt các tiến trình do app này khởi động (dịch vụ chạy sẵn từ dev.sh được giữ nguyên)
            for mut c in handle.state::<Children>().0.lock().unwrap().drain(..) {
                let _ = c.kill();
                let _ = c.wait();
            }
        }
    });
}
