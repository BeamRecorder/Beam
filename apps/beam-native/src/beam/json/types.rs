use serde::Serialize;

#[derive(Serialize)]
pub(super) struct ErrorResponse {
    pub error: String,
}
#[derive(Serialize)]
pub(crate) struct ValueResponse<T: Serialize> {
    pub value: T,
}
