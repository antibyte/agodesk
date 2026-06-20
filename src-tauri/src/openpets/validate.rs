use crate::openpets::protocol::OpenPetsClientError;

pub fn validate_speech_message(message: &str) -> Result<String, OpenPetsClientError> {
    let trimmed = message.trim();
    if trimmed.is_empty() || trimmed.len() > 140 {
        return Err(OpenPetsClientError {
            code: "invalid_message".to_string(),
            message: "OpenPets speech message must be 1-140 characters.".to_string(),
        });
    }
    if trimmed.contains('\n') || trimmed.contains('\r') {
        return Err(OpenPetsClientError {
            code: "invalid_message".to_string(),
            message: "OpenPets speech message must be a single line.".to_string(),
        });
    }

    let lower = trimmed.to_lowercase();
    let blocked_patterns = [
        "`", "<script", "function ", "class ", "import ", "const ", "=>",
        "http://", "https://", "www.", "api_key", "secret", "token", "password",
        "-----begin",
    ];
    for pattern in blocked_patterns {
        if lower.contains(pattern) {
            return Err(OpenPetsClientError {
                code: "invalid_message".to_string(),
                message: "OpenPets speech message contains blocked content.".to_string(),
            });
        }
    }

    if looks_like_path(trimmed) {
        return Err(OpenPetsClientError {
            code: "invalid_message".to_string(),
            message: "OpenPets speech message must not contain file paths.".to_string(),
        });
    }

    Ok(trimmed.to_string())
}

fn looks_like_path(value: &str) -> bool {
    if value.contains('\\') {
        return true;
    }
    if value.starts_with('/') {
        return true;
    }
    if value.len() >= 3 {
        let bytes = value.as_bytes();
        if bytes[1] == b':' && bytes[2] == b'\\' && bytes[0].is_ascii_alphabetic() {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::validate_speech_message;

    #[test]
    fn accepts_short_status_message() {
        assert_eq!(
            validate_speech_message("  Agent arbeitet  ").unwrap(),
            "Agent arbeitet"
        );
    }

    #[test]
    fn rejects_urls_and_paths() {
        assert!(validate_speech_message("https://example.com").is_err());
        assert!(validate_speech_message(r"C:\Users\secret.txt").is_err());
        assert!(validate_speech_message("/etc/passwd").is_err());
    }
}
