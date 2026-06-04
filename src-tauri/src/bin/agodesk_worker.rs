use agodesk_lib::computer_use::{self, types::WorkerRequest};
use std::io::{self, BufRead, Write};

fn main() {
    if let Err(error) = run() {
        eprintln!("agodesk-worker error: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let line = line.map_err(|error| error.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        let request: WorkerRequest =
            serde_json::from_str(&line).map_err(|error| format!("Invalid request JSON: {error}"))?;
        let response = computer_use::handle_worker_request(request);
        let payload =
            serde_json::to_string(&response).map_err(|error| error.to_string())?;
        println!("{payload}");
        io::stdout().flush().map_err(|error| error.to_string())?;
    }
    Ok(())
}
