pub mod browser;
pub mod client;
pub mod context;
pub mod input;
pub mod platform;
pub mod types;

use crate::computer_use::types::{UiActionParams, UiActionResult, UiTreeResult};

pub fn get_active_window() -> Result<types::ActiveWindowInfo, String> {
    context::get_active_window()
}

pub fn ui_tree_for_window(window_id: Option<&str>) -> Result<UiTreeResult, String> {
    client::dispatch_ui_tree(window_id)
}

pub fn perform_ui_action(params: &UiActionParams) -> Result<UiActionResult, String> {
    client::dispatch_ui_action(params)
}

pub fn ui_automation_available() -> bool {
    platform::ui_automation_available()
}

pub fn handle_worker_request(request: types::WorkerRequest) -> types::WorkerResponse {
    match request {
        types::WorkerRequest::Ping => types::WorkerResponse {
            success: true,
            data: Some(serde_json::json!({ "pong": true })),
            error: None,
        },
        types::WorkerRequest::ActiveWindow => match get_active_window() {
            Ok(data) => types::WorkerResponse {
                success: true,
                data: serde_json::to_value(data).ok(),
                error: None,
            },
            Err(error) => types::WorkerResponse {
                success: false,
                data: None,
                error: Some(error),
            },
        },
        types::WorkerRequest::UiTree { window_id } => {
            match platform::ui_tree_for_window(window_id.as_deref()) {
                Ok(data) => types::WorkerResponse {
                    success: true,
                    data: serde_json::to_value(data).ok(),
                    error: None,
                },
                Err(error) => types::WorkerResponse {
                    success: false,
                    data: None,
                    error: Some(error),
                },
            }
        }
        types::WorkerRequest::UiAction(params) => match platform::perform_ui_action(&params) {
            Ok(data) => types::WorkerResponse {
                success: true,
                data: serde_json::to_value(data).ok(),
                error: None,
            },
            Err(error) => types::WorkerResponse {
                success: false,
                data: None,
                error: Some(error),
            },
        },
    }
}
