use std::sync::Arc;

use serde_json::json;
use tokio::sync::{Mutex, RwLock};
use tokio::task::JoinHandle;
use uuid::Uuid;

use crate::openpets::client::{send_discovered_request, SendRequestOptions};

#[derive(Default)]
pub struct OpenPetsRuntimeState {
    pub enabled: bool,
    pub pet_id: Option<String>,
    pub lease_id: Option<String>,
    pub session_nonce: String,
    heartbeat_handle: Option<JoinHandle<()>>,
}

impl OpenPetsRuntimeState {
    pub fn new() -> Self {
        Self {
            session_nonce: Uuid::new_v4().to_string(),
            ..Default::default()
        }
    }
}

#[derive(Clone)]
pub struct OpenPetsState {
    inner: Arc<RwLock<OpenPetsRuntimeState>>,
    lease_lock: Arc<Mutex<()>>,
}

impl Default for OpenPetsState {
    fn default() -> Self {
        Self {
            inner: Arc::new(RwLock::new(OpenPetsRuntimeState::new())),
            lease_lock: Arc::new(Mutex::new(())),
        }
    }
}

impl OpenPetsState {
    pub async fn set_enabled(&self, enabled: bool, pet_id: Option<String>) -> Result<(), String> {
        let _guard = self.lease_lock.lock().await;
        let mut state = self.inner.write().await;
        state.enabled = enabled;
        state.pet_id = pet_id.filter(|value| !value.trim().is_empty());

        if !enabled {
            stop_heartbeat(&mut state).await;
            if let Some(lease_id) = state.lease_id.take() {
                let _ = release_lease(&lease_id).await;
            }
            return Ok(());
        }

        stop_heartbeat(&mut state).await;
        let lease_id = acquire_lease(state.pet_id.clone(), state.session_nonce.clone()).await?;
        state.lease_id = Some(lease_id.clone());
        state.heartbeat_handle = Some(spawn_heartbeat(self.clone(), lease_id));
        Ok(())
    }

    pub async fn current_lease_id(&self) -> Option<String> {
        self.inner.read().await.lease_id.clone()
    }

    pub async fn configured_pet_id(&self) -> Option<String> {
        self.inner.read().await.pet_id.clone()
    }

    pub async fn is_enabled(&self) -> bool {
        self.inner.read().await.enabled
    }

    pub async fn shutdown(&self) {
        let _guard = self.lease_lock.lock().await;
        let mut state = self.inner.write().await;
        stop_heartbeat(&mut state).await;
        if let Some(lease_id) = state.lease_id.take() {
            let _ = release_lease(&lease_id).await;
        }
        state.enabled = false;
    }
}

async fn stop_heartbeat(state: &mut OpenPetsRuntimeState) {
    if let Some(handle) = state.heartbeat_handle.take() {
        handle.abort();
    }
}

fn spawn_heartbeat(state: OpenPetsState, lease_id: String) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        interval.tick().await;
        loop {
            interval.tick().await;
            let enabled = state.is_enabled().await;
            if !enabled {
                break;
            }
            if heartbeat_lease(&lease_id).await.is_err() {
                let _guard = state.lease_lock.lock().await;
                let mut runtime = state.inner.write().await;
                if runtime.lease_id.as_deref() != Some(lease_id.as_str()) {
                    break;
                }
                stop_heartbeat(&mut runtime).await;
                match acquire_lease(runtime.pet_id.clone(), runtime.session_nonce.clone()).await {
                    Ok(next_lease) => {
                        runtime.lease_id = Some(next_lease.clone());
                        runtime.heartbeat_handle = Some(spawn_heartbeat(state.clone(), next_lease));
                    }
                    Err(_) => {
                        runtime.lease_id = None;
                    }
                }
                break;
            }
        }
    })
}

async fn acquire_lease(
    requested_pet_id: Option<String>,
    session_nonce: String,
) -> Result<String, String> {
    let mut params = json!({
        "clientPid": std::process::id(),
        "sessionNonce": session_nonce,
    });
    if let Some(pet_id) = requested_pet_id {
        params["requestedPetId"] = json!(pet_id);
    }
    let result = send_discovered_request("lease.acquire", params, SendRequestOptions::default())
        .await
        .map_err(|error| error.to_string())?;
    result
        .get("leaseId")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .ok_or_else(|| "OpenPets lease response is invalid.".to_string())
}

async fn heartbeat_lease(lease_id: &str) -> Result<(), String> {
    send_discovered_request(
        "lease.heartbeat",
        json!({ "leaseId": lease_id }),
        SendRequestOptions::default(),
    )
    .await
    .map(|_| ())
    .map_err(|error| error.to_string())
}

async fn release_lease(lease_id: &str) -> Result<(), String> {
    send_discovered_request(
        "lease.release",
        json!({ "leaseId": lease_id }),
        SendRequestOptions::default(),
    )
    .await
    .map(|_| ())
    .map_err(|error| error.to_string())
}
