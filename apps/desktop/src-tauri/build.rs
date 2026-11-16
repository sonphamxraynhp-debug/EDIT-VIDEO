fn main() {
    // Đường dẫn dự án mặc định = thư mục gốc repo (apps/desktop/src-tauri → ../../..)
    let manifest = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let root = manifest.join("../../..").canonicalize().unwrap_or(manifest);
    println!("cargo:rustc-env=AVF_BUILD_ROOT={}", root.display());
    tauri_build::build()
}
