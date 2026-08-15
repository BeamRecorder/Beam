use super::insufficient_disk_space_message;

#[test]
fn insufficient_disk_space_message_uses_mb() {
    assert_eq!(
        insufficient_disk_space_message(401_031_168, 536_870_912),
        "insufficient disk space: 382 MB available, 512 MB required"
    );
}

#[test]
fn insufficient_disk_space_message_rounds_required_mb_up() {
    assert_eq!(
        insufficient_disk_space_message(1_048_576, 1_048_577),
        "insufficient disk space: 1 MB available, 2 MB required"
    );
}
