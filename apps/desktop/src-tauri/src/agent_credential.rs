use zeroize::Zeroizing;

#[cfg(test)]
use std::collections::HashMap;
#[cfg(test)]
use std::sync::Mutex;

const SERVICE_NAME: &str = "app.brilliant-guitar.agent-provider";
// Windows Credential Manager is the narrowest supported backend at 5 * 512 bytes.
const MAX_SECRET_BYTES: usize = 5 * 512;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AgentCredentialStoreError {
    InvalidProviderId,
    InvalidSecret,
    Unavailable,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderCredentialStatusV1 {
    pub provider_id: String,
    pub present: bool,
    pub status: AgentProviderCredentialStatusKindV1,
    pub message: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AgentProviderCredentialStatusKindV1 {
    Configured,
    Missing,
}

impl AgentProviderCredentialStatusV1 {
    pub fn new(provider_id: String, present: bool) -> Self {
        Self {
            provider_id,
            present,
            status: if present {
                AgentProviderCredentialStatusKindV1::Configured
            } else {
                AgentProviderCredentialStatusKindV1::Missing
            },
            message: if present {
                "Provider 凭据已保存在系统凭据库".into()
            } else {
                "尚未配置 Provider 凭据".into()
            },
        }
    }
}

pub struct AgentCredentialStore {
    backend: AgentCredentialBackend,
}

enum AgentCredentialBackend {
    System,
    #[cfg(test)]
    Memory(Mutex<HashMap<String, String>>),
}

impl AgentCredentialStore {
    pub fn system() -> Self {
        Self {
            backend: AgentCredentialBackend::System,
        }
    }

    #[cfg(test)]
    pub fn memory() -> Self {
        Self {
            backend: AgentCredentialBackend::Memory(Mutex::new(HashMap::new())),
        }
    }

    pub fn status(&self, provider_id: &str) -> Result<bool, AgentCredentialStoreError> {
        validate_provider_id(provider_id)?;
        match &self.backend {
            AgentCredentialBackend::System => {
                system_read_secret(provider_id).map(|secret| secret.is_some())
            }
            #[cfg(test)]
            AgentCredentialBackend::Memory(secrets) => secrets
                .lock()
                .map(|values| values.contains_key(provider_id))
                .map_err(|_| AgentCredentialStoreError::Unavailable),
        }
    }

    pub fn set(&self, provider_id: &str, secret: &str) -> Result<(), AgentCredentialStoreError> {
        validate_provider_id(provider_id)?;
        validate_secret(secret)?;
        match &self.backend {
            AgentCredentialBackend::System => system_set_secret(provider_id, secret),
            #[cfg(test)]
            AgentCredentialBackend::Memory(secrets) => secrets
                .lock()
                .map(|mut values| {
                    values.insert(provider_id.to_owned(), secret.to_owned());
                })
                .map_err(|_| AgentCredentialStoreError::Unavailable),
        }
    }

    pub fn delete(&self, provider_id: &str) -> Result<bool, AgentCredentialStoreError> {
        validate_provider_id(provider_id)?;
        match &self.backend {
            AgentCredentialBackend::System => system_delete_secret(provider_id),
            #[cfg(test)]
            AgentCredentialBackend::Memory(secrets) => secrets
                .lock()
                .map(|mut values| values.remove(provider_id).is_some())
                .map_err(|_| AgentCredentialStoreError::Unavailable),
        }
    }

    /** Internal Provider adapters may read a secret; no Tauri command exposes this method. */
    #[allow(dead_code)]
    pub(crate) fn read_secret(
        &self,
        provider_id: &str,
    ) -> Result<Option<Zeroizing<String>>, AgentCredentialStoreError> {
        validate_provider_id(provider_id)?;
        match &self.backend {
            AgentCredentialBackend::System => system_read_secret(provider_id),
            #[cfg(test)]
            AgentCredentialBackend::Memory(secrets) => secrets
                .lock()
                .map(|values| values.get(provider_id).cloned().map(Zeroizing::new))
                .map_err(|_| AgentCredentialStoreError::Unavailable),
        }
    }
}

pub(crate) fn valid_provider_id(value: &str) -> bool {
    if value.is_empty() || value.chars().count() > 160 {
        return false;
    }
    value.split('.').all(|segment| {
        let mut chars = segment.chars();
        matches!(chars.next(), Some('a'..='z'))
            && chars.all(|character| {
                character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
            })
    })
}

fn validate_provider_id(value: &str) -> Result<(), AgentCredentialStoreError> {
    valid_provider_id(value)
        .then_some(())
        .ok_or(AgentCredentialStoreError::InvalidProviderId)
}

fn validate_secret(value: &str) -> Result<(), AgentCredentialStoreError> {
    (!value.is_empty()
        && value.trim() == value
        && value.len() <= MAX_SECRET_BYTES
        && !value.chars().any(char::is_control))
    .then_some(())
    .ok_or(AgentCredentialStoreError::InvalidSecret)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn system_entry(provider_id: &str) -> Result<keyring::Entry, AgentCredentialStoreError> {
    keyring::Entry::new(SERVICE_NAME, provider_id)
        .map_err(|_| AgentCredentialStoreError::Unavailable)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn system_read_secret(
    provider_id: &str,
) -> Result<Option<Zeroizing<String>>, AgentCredentialStoreError> {
    match system_entry(provider_id)?.get_password() {
        Ok(secret) => Ok(Some(Zeroizing::new(secret))),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(AgentCredentialStoreError::Unavailable),
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn system_read_secret(
    _provider_id: &str,
) -> Result<Option<Zeroizing<String>>, AgentCredentialStoreError> {
    Err(AgentCredentialStoreError::Unavailable)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn system_set_secret(provider_id: &str, secret: &str) -> Result<(), AgentCredentialStoreError> {
    system_entry(provider_id)?
        .set_password(secret)
        .map_err(|_| AgentCredentialStoreError::Unavailable)
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn system_set_secret(_provider_id: &str, _secret: &str) -> Result<(), AgentCredentialStoreError> {
    Err(AgentCredentialStoreError::Unavailable)
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
fn system_delete_secret(provider_id: &str) -> Result<bool, AgentCredentialStoreError> {
    match system_entry(provider_id)?.delete_credential() {
        Ok(()) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(_) => Err(AgentCredentialStoreError::Unavailable),
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn system_delete_secret(_provider_id: &str) -> Result<bool, AgentCredentialStoreError> {
    Err(AgentCredentialStoreError::Unavailable)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_store_round_trips_without_exposing_values_in_status() {
        let store = AgentCredentialStore::memory();
        assert!(!store.status("provider.example").expect("missing status"));

        store
            .set("provider.example", "secret-token")
            .expect("store secret");
        assert!(store.status("provider.example").expect("configured status"));
        let secret = store.read_secret("provider.example").expect("read secret");
        assert_eq!(
            secret.as_ref().map(|value| value.as_str()),
            Some("secret-token")
        );

        assert!(store.delete("provider.example").expect("delete secret"));
        assert!(
            !store
                .delete("provider.example")
                .expect("delete missing secret")
        );
        assert!(
            store
                .read_secret("provider.example")
                .expect("read missing secret")
                .is_none()
        );
    }

    #[test]
    fn provider_and_secret_validation_fail_closed() {
        let store = AgentCredentialStore::memory();
        assert_eq!(
            store.status("Invalid Provider"),
            Err(AgentCredentialStoreError::InvalidProviderId)
        );
        assert_eq!(
            store.set("provider.example", ""),
            Err(AgentCredentialStoreError::InvalidSecret)
        );
        assert_eq!(
            store.set("provider.example", " secret"),
            Err(AgentCredentialStoreError::InvalidSecret)
        );
        assert_eq!(
            store.set("provider.example", "line\nbreak"),
            Err(AgentCredentialStoreError::InvalidSecret)
        );
        assert_eq!(
            store.set("provider.example", &"a".repeat(MAX_SECRET_BYTES + 1)),
            Err(AgentCredentialStoreError::InvalidSecret)
        );
    }
}
