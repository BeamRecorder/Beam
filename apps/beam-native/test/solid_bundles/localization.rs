//! Audio policy and reactive localization checks for the actual built Solid scenes.

use super::{
    CONTRACT, DEFAULT_OPTION_ID, DEFAULT_OUTPUT, DEFAULT_OUTPUT_LABEL, ServiceRequest,
    assert_no_alert, assert_no_rejections, assert_select_geometry, assert_text_weight, click_named,
    contains_text, contract_member, hydrate_services, keyed_element, native_id, service_value,
};
use argui_host::Host;
use argui_runtime::{WireHostId, WireOperation};
use argui_ui::{Element, Role, SemanticValue};
use beam_native::{QuickJsGallery, ServiceOutcome, ServiceResponse};
use serde_json::{Value, json};
use std::{cell::RefCell, collections::VecDeque};

const FRENCH_LOCALE_LABEL: &str = "FR — Français";

/// Borrows the accepted native tree and queues without holding them during JavaScript delivery.
pub(super) struct Scene<'a> {
    pub(super) gallery: &'a QuickJsGallery,
    pub(super) host: &'a RefCell<Host>,
    pub(super) requests: &'a RefCell<VecDeque<String>>,
    pub(super) rejections: &'a RefCell<Vec<String>>,
    pub(super) operations: &'a RefCell<Vec<WireOperation>>,
    pub(super) name: &'a str,
}

/// Supplies a complete preference snapshot with an explicit default locale and audio mode.
pub(super) fn preferences(locale: &str) -> Value {
    json!({
        "theme": "light", "locale": locale, "captureMode": "recorder",
        "hudWindow": { "width": 680, "height": 252 }, "hudPosition": null,
        "devices": { "camera": "", "microphone": "", "systemAudio": DEFAULT_OUTPUT },
        "shortcuts": {}, "countdownSeconds": 3
    })
}

/// Returns the native save response, normalizing every enabled system output to `default`.
pub(super) fn saved_preferences(patch: &Value) -> Value {
    let mut value = preferences(patch["locale"].as_str().unwrap_or("en"));
    for field in [
        "theme",
        "captureMode",
        "hudWindow",
        "hudPosition",
        "shortcuts",
        "countdownSeconds",
    ] {
        if let Some(updated) = patch.get(field) {
            value[field] = updated.clone();
        }
    }
    if let Some(devices) = patch["devices"].as_object() {
        for (key, updated) in devices {
            value["devices"][key] = if key == "systemAudio" {
                json!(match updated.as_str().unwrap_or_default() {
                    "" | "off" | "no-audio" => "",
                    _ => DEFAULT_OUTPUT,
                })
            } else {
                updated.clone()
            };
        }
    }
    value
}

impl Scene<'_> {
    /// Keeps initial English reads pending so later preference events can supersede them.
    pub(super) fn defer_initial_preferences(&self) -> Vec<ServiceRequest> {
        if !matches!(
            self.name,
            "app.mjs:mountGallery" | "app.mjs:mountSettings" | "settings.mjs:mountGallery"
        ) {
            return Vec::new();
        }
        let pending = std::mem::take(&mut *self.requests.borrow_mut());
        let mut delayed = Vec::new();
        let mut remaining = VecDeque::new();
        for json in pending {
            let request: ServiceRequest =
                serde_json::from_str(&json).expect("valid service request");
            if request.service == "beam" && request.method == "preferences" {
                assert!(request.request_id > 0 && !request.window.is_empty());
                delayed.push(request);
            } else {
                remaining.push_back(json);
            }
        }
        *self.requests.borrow_mut() = remaining;
        assert!(
            delayed.len() >= 2,
            "{} must observe preferences and locale independently",
            self.name
        );
        delayed
    }

    /// Publishes the same unsolicited preference envelope delivered to each live native scene.
    pub(super) fn publish_preferences(&self, window: &str, locale: &str) {
        self.event(
            window,
            json!({ "type": "preferencesChanged", "preferences": preferences(locale) }),
        );
    }

    /// Verifies On/Off options remain selectable and ignore sink catalog identities on refresh.
    pub(super) fn validate_system_audio_refresh(&self) {
        self.click("system-audio");
        self.hydrate(DEFAULT_OUTPUT_LABEL);
        let before = self.option_id(DEFAULT_OPTION_ID);
        let root = self.root();
        assert_select_geometry(&root);
        self.assert_audio_options(&root, "On", "Off");
        self.event(
            "main",
            json!({ "type": "windowVisibility", "window": "main", "visible": true }),
        );
        assert!(
            self.requests.borrow().iter().any(|json| {
                let request: ServiceRequest =
                    serde_json::from_str(json).expect("valid service request");
                request.service == "beam" && request.method == "sources"
            }),
            "{} visibility did not refresh sources",
            self.name
        );
        self.hydrate("Default system output refreshed");
        assert_eq!(
            self.option_id(DEFAULT_OPTION_ID),
            before,
            "source refresh recreated On"
        );
        self.assert_audio_options(&self.root(), "On", "Off");

        self.click("system-audio-placeholder");
        self.assert_saved_audio("");
        self.hydrate(DEFAULT_OUTPUT_LABEL);
        assert!(contains_text(
            keyed_element(&self.root(), "system-audio").unwrap(),
            "Off"
        ));
        self.click("system-audio");
        self.click(DEFAULT_OPTION_ID);
        self.assert_saved_audio(DEFAULT_OUTPUT);
        self.hydrate(DEFAULT_OUTPUT_LABEL);
        assert!(contains_text(
            keyed_element(&self.root(), "system-audio").unwrap(),
            "On"
        ));
        assert_no_alert(&self.operations.borrow(), self.name);
    }

    /// Preserves the existing real About hydration check and verifies explicit/default weights.
    pub(super) fn validate_about(&self) {
        self.click("settings-section-about");
        self.hydrate(DEFAULT_OUTPUT_LABEL);
        let root = self.root();
        assert_texts(
            &root,
            &[
                "Version test",
                "Linux · x86_64",
                "Version 0.4.0 is available.",
                "Download",
            ],
            self.name,
        );
        assert_text_weight(&root, "Beam", 600);
        assert_text_weight(&root, "Version test", 500);
        assert_no_alert(&self.operations.borrow(), self.name);
    }

    /// Changes live labels to French, then delivers older English reads without losing the event.
    pub(super) fn validate_locale(&self, delayed: Vec<ServiceRequest>) {
        let Some(first) = delayed.first() else { return };
        let window = first.window.clone();
        let hud = self.name == "app.mjs:mountGallery";
        if hud {
            let root = self.root();
            assert_texts(
                &root,
                &[
                    "Recorder",
                    "Screenshot",
                    "Instant",
                    "Full screen",
                    "Region",
                    "Window",
                    "Teleprompter",
                ],
                self.name,
            );
            assert_named(&root, Role::TabList, "Capture mode");
            assert_named(&root, Role::Button, "Preferences");
            assert_text_weight(&root, "Teleprompter", 500);
            assert_text_weight(&root, "Beam", 600);
            self.click("system-audio");
            self.assert_audio_options(&self.root(), "On", "Off");
        } else {
            self.click("settings-section-capture");
            let root = self.root();
            assert_texts(
                &root,
                &[
                    "Preferences",
                    "Capture",
                    "Shortcuts",
                    "Appearance",
                    "About",
                    "Default mode",
                    "Countdown",
                    "Recorder",
                ],
                self.name,
            );
            assert_text_weight(&root, "Preferences", 600);
            assert_text_weight(&root, "Countdown", 500);
            self.click_select("Default mode");
            assert_named(&self.root(), Role::ListBox, "Default mode");
            assert_texts(
                &self.root(),
                &["Recorder", "Screenshot", "Instant"],
                self.name,
            );
        }
        let retained_audio = hud.then(|| self.option_id(DEFAULT_OPTION_ID));
        self.publish_preferences(&window, "fr");
        self.assert_french(hud);
        for request in delayed {
            assert_eq!(request.window, window);
            let response = ServiceResponse {
                session: 1,
                window: request.window.clone(),
                request_id: request.request_id,
                outcome: ServiceOutcome::Ok(service_value(&request, DEFAULT_OUTPUT_LABEL)),
            };
            let delivered = self.gallery.deliver_service(&response.json().to_string());
            assert_no_rejections(self.rejections, self.name);
            delivered.unwrap_or_else(|error| {
                panic!(
                    "{} failed to deliver delayed preferences: {error}",
                    self.name
                )
            });
            self.assert_french(hud);
        }
        self.hydrate(DEFAULT_OUTPUT_LABEL);
        self.assert_french(hud);
        if let Some(before) = retained_audio {
            assert_eq!(
                self.option_id(DEFAULT_OPTION_ID),
                before,
                "locale changes recreated On"
            );
        } else {
            self.validate_french_appearance();
        }
        assert_no_alert(&self.operations.borrow(), self.name);
    }

    /// Checks text, accessibility labels and a currently open Select after a locale event.
    fn assert_french(&self, hud: bool) {
        let root = self.root();
        if hud {
            assert_texts(
                &root,
                &[
                    "Enregistreur",
                    "Capture d’écran",
                    "Instantané",
                    "Plein écran",
                    "Région",
                    "Fenêtre",
                    "Téléprompteur",
                ],
                self.name,
            );
            for label in [
                "Préférences",
                "Réduire",
                "Fermer",
                "Plein écran",
                "Région",
                "Fenêtre",
            ] {
                assert_named(&root, Role::Button, label);
            }
            assert_named(&root, Role::TabList, "Mode de capture");
            assert_named(&root, Role::ComboBox, "Audio système");
            assert_named(&root, Role::ComboBox, "Caméra");
            assert_named(&root, Role::ListBox, "Audio système");
            self.assert_audio_options(&root, "Activé", "Désactivé");
            assert_text_weight(&root, "Téléprompteur", 500);
            assert_text_weight(&root, "Beam", 600);
            assert!(!contains_text(&root, "Recorder") && !contains_text(&root, "System audio"));
        } else {
            assert_texts(
                &root,
                &[
                    "Préférences",
                    "Capture",
                    "Raccourcis",
                    "Apparence",
                    "À propos",
                    "Mode par défaut",
                    "Compte à rebours",
                    "Enregistreur",
                    "Capture d’écran",
                    "Instantané",
                ],
                self.name,
            );
            assert_named(&root, Role::ComboBox, "Mode par défaut");
            assert_named(&root, Role::ComboBox, "Compte à rebours");
            assert_named(&root, Role::ListBox, "Mode par défaut");
            assert_text_weight(&root, "Préférences", 600);
            assert_text_weight(&root, "Compte à rebours", 500);
            assert!(!contains_text(&root, "Preferences") && !contains_text(&root, "Default mode"));
        }
    }

    /// Checks persisted French selection and translated appearance popup labels/options.
    fn validate_french_appearance(&self) {
        self.click_select("Mode par défaut");
        self.click("settings-section-appearance");
        let root = self.root();
        assert_texts(
            &root,
            &["Thème", "Langue", "Clair", FRENCH_LOCALE_LABEL],
            self.name,
        );
        assert_text_weight(&root, "Langue", 500);
        assert_text_weight(&root, "Préférences", 600);
        let language =
            named_element(&root, Role::ComboBox, "Langue").expect("translated language Select");
        assert_eq!(
            language.semantics.as_ref().unwrap().value.as_ref(),
            Some(&SemanticValue::Text(FRENCH_LOCALE_LABEL.into()))
        );
        self.click_select("Thème");
        assert_named(&self.root(), Role::ListBox, "Thème");
        assert_texts(&self.root(), &["Système", "Sombre", "Clair"], self.name);
        self.click_select("Thème");
        self.click_select("Langue");
        let root = self.root();
        assert_named(&root, Role::ListBox, "Langue");
        let french =
            named_element(&root, Role::Option, FRENCH_LOCALE_LABEL).expect("French locale option");
        assert!(
            french.semantics.as_ref().unwrap().state.selected,
            "late English reads replaced the French preference"
        );
    }

    /// Asserts the menu has exactly two audio choices and never exposes catalog sink names.
    fn assert_audio_options(&self, root: &Element, on: &str, off: &str) {
        let menu = keyed_element(root, "system-audio-popup").expect("open system audio menu");
        assert_eq!(role_count(menu, Role::Option), 2);
        assert!(contains_text(
            keyed_element(menu, DEFAULT_OPTION_ID).unwrap(),
            on
        ));
        assert!(contains_text(
            keyed_element(menu, "system-audio-placeholder").unwrap(),
            off
        ));
        assert!(!contains_text(menu, "USB speaker"));
        assert!(!contains_text(menu, DEFAULT_OUTPUT_LABEL));
        assert!(!contains_text(menu, "Default system output refreshed"));
    }

    /// Checks the actual outgoing save patch before any response clears the request queue.
    fn assert_saved_audio(&self, value: &str) {
        assert!(
            self.requests.borrow().iter().any(|json| {
                let request: ServiceRequest =
                    serde_json::from_str(json).expect("valid service request");
                request.service == "beam"
                    && request.method == "savePreferences"
                    && request.payload["devices"]["systemAudio"].as_str() == Some(value)
            }),
            "{} did not save system audio as {value:?}",
            self.name
        );
    }

    /// Resolves the current host identity for an addressable audio option.
    fn option_id(&self, id: &str) -> WireHostId {
        let contract: Value = serde_json::from_str(CONTRACT).expect("generated native contract");
        let property = contract_member(&contract, "FocusScope", "properties", "id");
        native_id(&self.operations.borrow(), property, id)
    }

    /// Copies the accepted root so its host borrow ends before any subsequent native callback.
    fn root(&self) -> Element {
        self.host
            .borrow()
            .root_element()
            .expect("validated native root")
    }

    /// Clicks a current native control, surfacing even errors caught by application JavaScript.
    fn click(&self, id: &str) {
        let clicked = click_named(self.gallery, self.operations, id);
        assert_no_rejections(self.rejections, self.name);
        clicked.unwrap_or_else(|error| panic!("{} could not click {id}: {error}", self.name));
    }

    /// Finds a Select by its current translated accessibility name and clicks its stable ID.
    fn click_select(&self, label: &str) {
        let root = self.root();
        let select = named_element(&root, Role::ComboBox, label).expect("current Select");
        self.click(select.key.as_deref().expect("addressable Select"));
    }

    /// Drains requests outside RefCell borrows using the real QuickJS response path.
    fn hydrate(&self, output_label: &str) {
        hydrate_services(
            self.gallery,
            self.requests,
            self.rejections,
            self.name,
            output_label,
        );
    }

    /// Delivers an unsolicited event without borrowing a queue or host across JavaScript work.
    fn event(&self, window: &str, value: Value) {
        let delivered = self.gallery.deliver_service(
            &json!({
                "requestId": 0, "window": window, "status": "event", "value": value
            })
            .to_string(),
        );
        assert_no_rejections(self.rejections, self.name);
        delivered
            .unwrap_or_else(|error| panic!("{} rejected an application event: {error}", self.name));
    }
}

/// Finds a current retained element using its semantic role and resolved authored label.
fn named_element<'a>(root: &'a Element, role: Role, label: &str) -> Option<&'a Element> {
    if root.semantics.as_ref().is_some_and(|semantics| {
        semantics.role == role && semantics.label.as_deref() == Some(label)
    }) {
        return Some(root);
    }
    root.children
        .iter()
        .find_map(|child| named_element(child, role, label))
}

/// Counts native semantic options without relying on implementation wrapper depth.
fn role_count(root: &Element, role: Role) -> usize {
    usize::from(
        root.semantics
            .as_ref()
            .is_some_and(|semantics| semantics.role == role),
    ) + root
        .children
        .iter()
        .map(|child| role_count(child, role))
        .sum::<usize>()
}

/// Fails if a translated accessibility label is missing from the current tree.
fn assert_named(root: &Element, role: Role, label: &str) {
    assert!(
        named_element(root, role, label).is_some(),
        "missing {role:?} label {label:?}"
    );
}

/// Verifies visible native text after all queued Solid updates are accepted.
fn assert_texts(root: &Element, texts: &[&str], scene: &str) {
    for text in texts {
        assert!(
            contains_text(root, text),
            "{scene} omitted native text: {text}"
        );
    }
}
