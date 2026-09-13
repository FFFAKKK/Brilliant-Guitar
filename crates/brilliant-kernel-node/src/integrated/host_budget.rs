//! Version-2 candidate-read transport includes the complete Rust-to-Node
//! request and every Node-to-Rust response. Guest fuel/bytes and Core read
//! replies have separate accounts; neither bounds these host copies.
use std::{cell::RefCell, rc::Rc};

const MAX_OPERATION_HOST_BYTES: usize = 128 * 1024 * 1024;

struct Budget {
    remaining: usize,
    failed: bool,
}
impl Default for Budget {
    fn default() -> Self {
        Self {
            remaining: MAX_OPERATION_HOST_BYTES,
            failed: false,
        }
    }
}
impl Budget {
    fn charge(&mut self, bytes: usize) -> bool {
        if self.failed || bytes > self.remaining {
            self.failed = true;
            return false;
        }
        self.remaining -= bytes;
        true
    }
}

thread_local! {
    static ACTIVE: RefCell<Option<Rc<RefCell<Budget>>>> = const { RefCell::new(None) };
}

pub(super) struct OperationScope {
    owner: bool,
}
impl OperationScope {
    pub(super) fn enter(enabled: bool) -> Self {
        ACTIVE.with(|slot| {
            let mut slot = slot.borrow_mut();
            let owner = enabled && slot.is_none();
            if owner {
                *slot = Some(Rc::new(RefCell::new(Budget::default())));
            }
            Self { owner }
        })
    }
}
impl Drop for OperationScope {
    fn drop(&mut self) {
        if self.owner {
            ACTIVE.with(|slot| *slot.borrow_mut() = None);
        }
    }
}

pub(super) fn charge(bytes: usize) -> bool {
    ACTIVE.with(|slot| {
        slot.borrow()
            .as_ref()
            .is_none_or(|account| account.borrow_mut().charge(bytes))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_limit_counts_both_directions_and_sticks_through_nested_calls() {
        let outer = OperationScope::enter(true);
        let account = ACTIVE.with(|slot| slot.borrow().clone().unwrap());
        assert!(charge(64 * 1024 * 1024));
        {
            let _inner = OperationScope::enter(true);
            assert!(ACTIVE.with(|slot| Rc::ptr_eq(slot.borrow().as_ref().unwrap(), &account)));
            assert!(charge(64 * 1024 * 1024));
            assert!(!charge(1));
        }
        // An inner session may swallow its error, but the enclosing callback
        // must still reject rather than adopt a claimed successful result.
        assert!(!charge(0));
        drop(outer);
        let _independent = OperationScope::enter(true);
        assert!(charge(1));
    }

    #[test]
    fn old_protocol_is_unchanged_and_nested_old_calls_join_an_active_account() {
        let _old = OperationScope::enter(false);
        assert!(ACTIVE.with(|slot| slot.borrow().is_none()));
        assert!(charge(usize::MAX));
        let _new = OperationScope::enter(true);
        {
            let _nested_old = OperationScope::enter(false);
            assert!(!charge(MAX_OPERATION_HOST_BYTES + 1));
        }
        assert!(!charge(0));
    }

    #[test]
    fn a_callback_unwind_clears_the_account_and_threads_remain_independent() {
        let result = std::panic::catch_unwind(|| {
            let _scope = OperationScope::enter(true);
            assert!(charge(MAX_OPERATION_HOST_BYTES));
            std::thread::spawn(|| {
                assert!(ACTIVE.with(|slot| slot.borrow().is_none()));
                let _other = OperationScope::enter(true);
                assert!(charge(1));
            })
            .join()
            .unwrap();
            panic!("simulated callback unwind");
        });
        assert!(result.is_err());
        assert!(ACTIVE.with(|slot| slot.borrow().is_none()));
        let _next = OperationScope::enter(true);
        assert!(charge(1));
    }
}
