use serde::Serialize;
use serde_json::{json, Value};
use tauri::State;

use crate::openpets::client::{send_discovered_request, SendRequestOptions};
use crate::openpets::discovery::read_discovery_file;
use crate::openpets::protocol::{validate_pet_id, validate_reaction, OpenPetsClientError};
use crate::openpets::state::OpenPetsState;
use crate::openpets::validate::validate_speech_message;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenPetsStatusResponse {
    pub reachable: bool,
    pub enabled: bool,
    pub app_version: Option<String>,
    pub pet_id: Option<String>,
    pub pet_name: Option<String>,
    pub fallback_reason: Option<String>,
    pub unavailable_reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenPetsPetListItem {
    pub id: String,
    pub display_name: String,
    pub built_in: bool,
    pub broken: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenPetsPetListResponse {
    pub reachable: bool,
    pub default_pet_id: Option<String>,
    pub pets: Vec<OpenPetsPetListItem>,
    pub unavailable_reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenPetsActionResponse {
    pub ok: bool,
    pub unavailable_reason: Option<String>,
}

#[tauri::command]
pub async fn openpets_status(state: State<'_, OpenPetsState>) -> Result<OpenPetsStatusResponse, String> {
    let enabled = state.is_enabled().await;
    let configured_pet_id = state.configured_pet_id().await;

    match read_discovery_file(None) {
        Ok(discovery) => {
            let lease_id = state.current_lease_id().await;
            let mut params = json!({});
            if let Some(lease_id) = lease_id {
                params["leaseId"] = json!(lease_id);
            }
            match send_discovered_request("status", params, SendRequestOptions::default()).await {
                Ok(result) => {
                    let (pet_id, pet_name) =
                        resolve_pet_identity(&result, configured_pet_id.clone()).await;
                    Ok(OpenPetsStatusResponse {
                        reachable: result
                            .get("appRunning")
                            .and_then(|value| value.as_bool())
                            .unwrap_or(true),
                        enabled,
                        app_version: Some(discovery.app_version),
                        pet_id,
                        pet_name,
                        fallback_reason: result
                            .get("fallbackReason")
                            .and_then(|value| value.as_str())
                            .map(str::to_string),
                        unavailable_reason: result
                            .get("unavailableReason")
                            .and_then(|value| value.as_str())
                            .map(str::to_string),
                    })
                }
                Err(error) => Ok(unavailable_status(enabled, configured_pet_id, error)),
            }
        }
        Err(error) => Ok(unavailable_status(enabled, configured_pet_id, error)),
    }
}

#[tauri::command]
pub async fn openpets_set_enabled(
    enabled: bool,
    pet_id: Option<String>,
    state: State<'_, OpenPetsState>,
) -> Result<OpenPetsActionResponse, String> {
    let pet_id = match pet_id {
        Some(value) if !value.trim().is_empty() => {
            Some(validate_pet_id(value.trim()).map_err(|error| error.to_string())?)
        }
        _ => None,
    };
    state
        .set_enabled(enabled, pet_id)
        .await
        .map_err(|error| error.to_string())?;
    Ok(OpenPetsActionResponse {
        ok: true,
        unavailable_reason: None,
    })
}

#[tauri::command]
pub async fn openpets_react(
    reaction: String,
    state: State<'_, OpenPetsState>,
) -> Result<OpenPetsActionResponse, String> {
    if !state.is_enabled().await {
        return Ok(OpenPetsActionResponse {
            ok: false,
            unavailable_reason: Some("OpenPets integration is disabled.".to_string()),
        });
    }

    let reaction = match validate_reaction(reaction.trim()) {
        Ok(value) => value,
        Err(error) => {
            return Ok(OpenPetsActionResponse {
                ok: false,
                unavailable_reason: Some(error.to_string()),
            });
        }
    };

    let mut payload = json!({ "reaction": reaction });
    if let Some(lease_id) = state.current_lease_id().await {
        payload["leaseId"] = json!(lease_id);
    }

    match send_discovered_request("pet.react", payload, SendRequestOptions::default()).await {
        Ok(_) => Ok(OpenPetsActionResponse {
            ok: true,
            unavailable_reason: None,
        }),
        Err(error) => Ok(action_error(error)),
    }
}

#[tauri::command]
pub async fn openpets_say(
    message: String,
    reaction: Option<String>,
    state: State<'_, OpenPetsState>,
) -> Result<OpenPetsActionResponse, String> {
    if !state.is_enabled().await {
        return Ok(OpenPetsActionResponse {
            ok: false,
            unavailable_reason: Some("OpenPets integration is disabled.".to_string()),
        });
    }

    let message = match validate_speech_message(&message) {
        Ok(value) => value,
        Err(error) => {
            return Ok(OpenPetsActionResponse {
                ok: false,
                unavailable_reason: Some(error.to_string()),
            });
        }
    };

    let mut payload = json!({ "message": message });
    if let Some(reaction) = reaction {
        if let Ok(validated) = validate_reaction(reaction.trim()) {
            payload["reaction"] = json!(validated);
        }
    }
    if let Some(lease_id) = state.current_lease_id().await {
        payload["leaseId"] = json!(lease_id);
    }

    match send_discovered_request("pet.say", payload, SendRequestOptions::default()).await {
        Ok(_) => Ok(OpenPetsActionResponse {
            ok: true,
            unavailable_reason: None,
        }),
        Err(error) => Ok(action_error(error)),
    }
}

#[tauri::command]
pub async fn openpets_list_pets() -> Result<OpenPetsPetListResponse, String> {
    match send_discovered_request("pets.list", json!({}), SendRequestOptions::default()).await {
        Ok(result) => Ok(OpenPetsPetListResponse {
            reachable: true,
            default_pet_id: result
                .get("defaultPetId")
                .and_then(|value| value.as_str())
                .map(str::to_string),
            pets: parse_pet_list(result.get("pets")),
            unavailable_reason: None,
        }),
        Err(error) => Ok(OpenPetsPetListResponse {
            reachable: false,
            default_pet_id: None,
            pets: Vec::new(),
            unavailable_reason: Some(sanitize_error_message(&error)),
        }),
    }
}

fn parse_pet_list(value: Option<&Value>) -> Vec<OpenPetsPetListItem> {
    let Some(array) = value.and_then(|entry| entry.as_array()) else {
        return Vec::new();
    };
    array
        .iter()
        .filter_map(|entry| {
            Some(OpenPetsPetListItem {
                id: entry.get("id")?.as_str()?.to_string(),
                display_name: entry.get("displayName")?.as_str()?.to_string(),
                built_in: entry.get("builtIn").and_then(|value| value.as_bool()).unwrap_or(false),
                broken: entry.get("broken").and_then(|value| value.as_bool()).unwrap_or(false),
            })
        })
        .collect()
}

fn unavailable_status(
    enabled: bool,
    pet_id: Option<String>,
    error: OpenPetsClientError,
) -> OpenPetsStatusResponse {
    OpenPetsStatusResponse {
        reachable: false,
        enabled,
        app_version: None,
        pet_id,
        pet_name: None,
        fallback_reason: None,
        unavailable_reason: Some(sanitize_error_message(&error)),
    }
}

fn action_error(error: OpenPetsClientError) -> OpenPetsActionResponse {
    OpenPetsActionResponse {
        ok: false,
        unavailable_reason: Some(sanitize_error_message(&error)),
    }
}

fn sanitize_error_message(error: &OpenPetsClientError) -> String {
    if error.code == "unavailable"
        || error.code == "connect_timeout"
        || error.code == "response_timeout"
        || error.code == "connection_closed"
    {
        "OpenPets desktop app or local IPC is unavailable.".to_string()
    } else {
        error.message.clone()
    }
}

fn json_string_field(value: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(text) = value.get(key).and_then(Value::as_str) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn extract_status_pet_id(result: &Value, configured: Option<String>) -> Option<String> {
    json_string_field(
        result,
        &[
            "actualTargetPetId",
            "activePetId",
            "runningPetId",
            "visiblePetId",
            "targetPetId",
            "defaultPetId",
            "configuredPetId",
        ],
    )
    .or(configured)
}

fn extract_status_pet_name(result: &Value) -> Option<String> {
    json_string_field(
        result,
        &[
            "actualTargetPetName",
            "activePetName",
            "runningPetName",
            "visiblePetName",
            "targetPetName",
            "defaultPetName",
        ],
    )
    .or_else(|| {
        result.get("lease").and_then(|lease| {
            json_string_field(lease, &["actualTargetPetName", "targetPetName"])
        })
    })
}

fn lookup_pet_display_name(pets: &[OpenPetsPetListItem], pet_id: &str) -> Option<String> {
    pets.iter()
        .find(|pet| pet.id == pet_id)
        .map(|pet| pet.display_name.clone())
}

async fn resolve_pet_identity(
    status: &Value,
    configured_pet_id: Option<String>,
) -> (Option<String>, Option<String>) {
    let mut pet_id = extract_status_pet_id(status, configured_pet_id);
    let mut pet_name = extract_status_pet_name(status);

    if pet_name.is_some() {
        return (pet_id, pet_name);
    }

    let Ok(list) =
        send_discovered_request("pets.list", json!({}), SendRequestOptions::default()).await
    else {
        return (pet_id, pet_name);
    };

    let pets = parse_pet_list(list.get("pets"));
    let default_pet_id = json_string_field(&list, &["defaultPetId"]);

    if pet_id.is_none() {
        pet_id = default_pet_id.clone();
    }

    if let Some(id) = pet_id.as_deref() {
        pet_name = lookup_pet_display_name(&pets, id);
    }

    if pet_name.is_none() {
        if let Some(default_id) = default_pet_id.as_deref() {
            pet_name = lookup_pet_display_name(&pets, default_id);
            if pet_id.is_none() {
                pet_id = Some(default_id.to_string());
            }
        }
    }

    (pet_id, pet_name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extract_status_pet_id_prefers_actual_target() {
        let status = json!({
            "actualTargetPetId": "cloud-puff",
            "defaultPetId": "builtin"
        });
        assert_eq!(
            extract_status_pet_id(&status, None),
            Some("cloud-puff".to_string())
        );
    }

    #[test]
    fn extract_status_pet_name_reads_nested_lease() {
        let status = json!({
            "lease": {
                "actualTargetPetName": "Cloud Puff"
            }
        });
        assert_eq!(
            extract_status_pet_name(&status),
            Some("Cloud Puff".to_string())
        );
    }

    #[test]
    fn lookup_pet_display_name_finds_catalog_entry() {
        let pets = vec![OpenPetsPetListItem {
            id: "cloud-puff".to_string(),
            display_name: "Cloud Puff".to_string(),
            built_in: false,
            broken: false,
        }];
        assert_eq!(
            lookup_pet_display_name(&pets, "cloud-puff"),
            Some("Cloud Puff".to_string())
        );
    }
}
