use beam_native::QuickJsGallery;
#[path = "../../src/runner/scene.rs"]
mod implementation;
use implementation::NativeScene;
use std::{cell::RefCell, rc::Rc};

fn scene(body: &str) -> (NativeScene, Rc<RefCell<Vec<String>>>) {
    let disposed = Rc::new(RefCell::new(Vec::new()));
    let observed = Rc::clone(&disposed);
    let source = format!(
        "export function mountGallery() {{ {body} return () => {{ __arguiService('disposed'); }}; }}"
    );
    let gallery = QuickJsGallery::new_with_services(
        &source,
        r#"{"abiHash":"test"}"#,
        "mountGallery",
        |_| String::new(),
        |_| String::new(),
        move |value| {
            observed.borrow_mut().push(value);
            String::new()
        },
        |_| String::new(),
    )
    .unwrap();
    (
        NativeScene {
            gallery,
            window: "fixture",
        },
        disposed,
    )
}

#[test]
fn a_mounted_scene_disposes_once_at_normal_shutdown() {
    let (scene, disposed) = scene("");
    assert!(disposed.borrow().is_empty());
    drop(scene);
    assert_eq!(&*disposed.borrow(), &["disposed"]);
}

#[test]
fn a_scene_disposes_before_returning_an_initialization_or_delivery_failure() {
    let (scene, disposed) =
        scene("globalThis.__arguiDeliverService = () => { throw new Error('delivery failed'); };");
    let result = (|| -> Result<(), String> {
        let scene = scene;
        scene.gallery.deliver_service("{}")?;
        Ok(())
    })();
    assert!(result.unwrap_err().contains("delivery failed"));
    assert_eq!(&*disposed.borrow(), &["disposed"]);
}

#[test]
fn a_scene_disposes_even_when_its_actor_exits_before_first_acknowledgement() {
    let (scene, disposed) = scene("");
    let result: Result<(), String> = {
        let _scene = scene;
        Err("native acknowledgement rejected".into())
    };
    assert!(result.is_err());
    assert_eq!(&*disposed.borrow(), &["disposed"]);
}

#[test]
fn a_disposer_failure_does_not_unwind_the_actor_cleanup() {
    let gallery = QuickJsGallery::new(r#"export function mountGallery() { return () => { throw new Error('dispose failed'); }; }"#,
        r#"{"abiHash":"test"}"#, "mountGallery", |_| String::new()).unwrap();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        drop(NativeScene {
            gallery,
            window: "fixture",
        })
    }));
    assert!(result.is_ok());
}
