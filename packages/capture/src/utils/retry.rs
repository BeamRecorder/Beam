pub fn retry<T, E>(attempts: usize, mut operation: impl FnMut() -> Result<T, E>) -> Result<T, E> {
    let mut result = operation();
    for _ in 1..attempts {
        if result.is_ok() {
            break;
        }
        result = operation();
    }
    result
}
