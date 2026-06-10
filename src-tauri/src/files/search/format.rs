use serde::Serialize;
use serde_json::{Value, json};

#[derive(Debug, Clone, Serialize)]
pub struct FileSearchMatch {
    pub file: String,
    pub line: u64,
    pub content: String,
}

#[derive(Debug, Serialize)]
struct FileSearchJsonResult {
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

pub fn encode_success(data: Value) -> String {
    encode(FileSearchJsonResult {
        status: "success",
        message: None,
        data: Some(data),
    })
}

pub fn encode_error(message: impl Into<String>) -> String {
    encode(FileSearchJsonResult {
        status: "error",
        message: Some(message.into()),
        data: None,
    })
}

fn encode(result: FileSearchJsonResult) -> String {
    serde_json::to_string(&result).unwrap_or_else(|_| {
        r#"{"status":"error","message":"internal: result serialization failed"}"#.to_string()
    })
}

pub fn matches_to_json(matches: Vec<FileSearchMatch>) -> Value {
    serde_json::to_value(matches).unwrap_or(Value::Null)
}

pub fn grep_count_data(count: usize, file: &str) -> Value {
    json!({
        "count": count,
        "file": file,
    })
}

pub fn grep_recursive_count_data(total: usize, by_file: &[(String, usize)]) -> Value {
    let mut file_counts = serde_json::Map::new();
    for (file, count) in by_file {
        file_counts.insert(file.clone(), json!(count));
    }
    json!({
        "total": total,
        "files_count": file_counts.len(),
        "by_file": file_counts,
    })
}

pub fn find_data(count: usize, files: Vec<String>) -> Value {
    json!({
        "count": count,
        "files": files,
    })
}
