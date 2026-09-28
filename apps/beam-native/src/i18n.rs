//! Synchronous QuickJS access to the renderer-independent Rust localizer.

use crate::json;
use argui_i18n::{Catalog, FluentArgs, LanguageIdentifier, Localizer};
use serde_json::Value;
mod types;

/// One JavaScript session's loaded catalogs and selected locale.
#[derive(Default)]
pub(crate) struct NativeI18n {
    localizer: Option<Localizer>,
}

impl NativeI18n {
    /// Loads `json` containing a fallback locale and flat JSON catalogs.
    /// Returns a JSON response with the effective locale and direction, or an error.
    pub(crate) fn load(&mut self, json: &str) -> String {
        respond(self.load_inner(json))
    }

    /// Selects `locale` through native locale negotiation.
    /// Returns a JSON response with the effective locale and direction, or an error.
    pub(crate) fn select(&mut self, locale: &str) -> String {
        respond(self.select_inner(locale))
    }

    /// Formats message `id` with variables encoded in `args` as a JSON object.
    /// Returns a JSON response with translated text, or an error.
    pub(crate) fn translate(&self, id: &str, args: &str) -> String {
        respond(self.translate_inner(id, args))
    }

    /// Parses `source` into native catalogs and returns the selected locale.
    /// Returns an error for malformed JSON, locales, or Fluent patterns.
    fn load_inner(&mut self, source: &str) -> Result<Value, String> {
        let data: Value = serde_json::from_str(source).map_err(|error| error.to_string())?;
        let fallback = data
            .get("fallback")
            .and_then(Value::as_str)
            .ok_or("i18n fallback must be a locale string")?
            .parse::<LanguageIdentifier>()
            .map_err(|error| format!("invalid fallback locale: {error}"))?;
        let catalogs = data
            .get("catalogs")
            .and_then(Value::as_object)
            .ok_or("i18n catalogs must be an object of locale JSON maps")?;
        let mut parsed = Vec::with_capacity(catalogs.len());
        for (locale, messages) in catalogs {
            let locale = locale
                .parse::<LanguageIdentifier>()
                .map_err(|error| format!("invalid catalog locale: {error}"))?;
            let messages = serde_json::to_string(messages).map_err(|error| error.to_string())?;
            parsed.push(Catalog::from_json(locale, &messages).map_err(|error| error.to_string())?);
        }
        let mut localizer = Localizer::new(fallback, parsed).map_err(|error| error.to_string())?;
        if let Some(locale) = data.get("locale").and_then(Value::as_str) {
            let selected = locale
                .parse::<LanguageIdentifier>()
                .map_err(|error| format!("invalid selected locale: {error}"))?;
            localizer.select([selected]);
        }
        let result = locale_response(&localizer);
        self.localizer = Some(localizer);
        Ok(result)
    }

    /// Negotiates `locale` against the loaded catalogs and returns its result.
    /// Returns an error for an invalid locale or an unloaded catalog set.
    fn select_inner(&mut self, locale: &str) -> Result<Value, String> {
        let requested = locale
            .parse::<LanguageIdentifier>()
            .map_err(|error| format!("invalid selected locale: {error}"))?;
        let localizer = self
            .localizer
            .as_mut()
            .ok_or("i18n catalogs are not loaded")?;
        localizer.select([requested]);
        Ok(locale_response(localizer))
    }

    /// Formats `id` using JSON object `args` and returns localized text.
    /// Returns an error for invalid variables, missing catalogs, or formatting.
    fn translate_inner(&self, id: &str, args: &str) -> Result<Value, String> {
        let localizer = self
            .localizer
            .as_ref()
            .ok_or("i18n catalogs are not loaded")?;
        let args: Value = serde_json::from_str(args).map_err(|error| error.to_string())?;
        let values = args
            .as_object()
            .ok_or("i18n variables must be a JSON object")?;
        let mut variables = FluentArgs::new();
        for (name, value) in values {
            match value {
                Value::String(text) => variables.set(name.as_str(), text.as_str()),
                Value::Number(number) => variables.set(
                    name.as_str(),
                    number
                        .as_f64()
                        .ok_or("i18n numeric variable is out of range")?,
                ),
                Value::Bool(flag) => variables.set(name.as_str(), flag.to_string()),
                _ => {
                    return Err(format!(
                        "i18n variable `{name}` must be a string, number, or boolean"
                    ));
                }
            }
        }
        let text = localizer
            .format(id, &variables)
            .map_err(|error| error.to_string())?;
        json::encode(&json::ValueResponse { value: text })
    }
}

/// Encodes the locale and text direction selected by `localizer` for JavaScript.
fn locale_response(localizer: &Localizer) -> Value {
    json::encode(&types::LocaleResponse {
        locale: localizer.locale().to_string(),
        rtl: localizer.is_rtl(),
    })
    .expect("locale response is serializable")
}

/// Encodes one successful `value` or its error as a JSON response for QuickJS.
fn respond(value: Result<Value, String>) -> String {
    match value {
        Ok(value) => value.to_string(),
        Err(error) => json::error_response(error),
    }
}

#[path = "../test/i18n.rs"]
mod i18n_checks;
