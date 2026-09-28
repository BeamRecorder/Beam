use serde::Serialize;

#[derive(Serialize)]
pub(super) struct LocaleResponse {
    pub locale: String,
    pub rtl: bool,
}
