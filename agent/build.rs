use embed_manifest::manifest::ExecutionLevel;
use embed_manifest::{embed_manifest, new_manifest};

fn main() {
    // Windows only: installing the service needs admin, so the exe asks for
    // it up front (a UAC prompt on double-click). The service itself runs as
    // LocalSystem, where the request has no effect.
    //
    // Release builds only: Cargo links the manifest into test binaries too,
    // and `cargo test` couldn't start them from a normal terminal.
    let windows = std::env::var_os("CARGO_CFG_WINDOWS").is_some();
    let release = std::env::var("PROFILE").is_ok_and(|profile| profile == "release");
    if windows && release {
        let manifest = new_manifest("Monli.Agent")
            .requested_execution_level(ExecutionLevel::RequireAdministrator);
        embed_manifest(manifest).expect("embedding the Windows manifest");
    }
    println!("cargo:rerun-if-changed=build.rs");
}
