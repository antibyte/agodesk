use tokio::sync::Mutex;

#[cfg(feature = "browser-automation")]
use super::cdp::CdpSession;

pub struct BrowserState {
    #[cfg(feature = "browser-automation")]
    pub(crate) session: Mutex<Option<CdpSession>>,
}

impl Default for BrowserState {
    fn default() -> Self {
        Self {
            #[cfg(feature = "browser-automation")]
            session: Mutex::new(None),
        }
    }
}
