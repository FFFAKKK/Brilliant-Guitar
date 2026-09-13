//! Synchronous N-API calls share the enclosing operation's Rust-owned account.
//! Nested operations inherit it; only leaving the outer scope resets it.
use brilliant_kernel_session::{
    WasmExecutionErrorV1, WasmExecutionOutputV1, WasmExecutorV1, WasmOperationBudgetV1,
};
use std::{cell::RefCell, rc::Rc};

thread_local! {
    static ACTIVE: RefCell<Option<Rc<RefCell<WasmOperationBudgetV1>>>> = const { RefCell::new(None) };
}

pub(crate) struct OperationScope {
    owner: bool,
}

impl OperationScope {
    pub(crate) fn enter() -> Self {
        ACTIVE.with(|slot| {
            let mut slot = slot.borrow_mut();
            let owner = slot.is_none();
            if owner {
                *slot = Some(Rc::new(RefCell::new(WasmOperationBudgetV1::default())));
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

pub(crate) fn operation_failed() -> bool {
    ACTIVE.with(|slot| {
        slot.borrow()
            .as_ref()
            .is_some_and(|budget| budget.borrow().failed())
    })
}

pub(super) fn execute(
    executor: &WasmExecutorV1,
    input: &[u8],
) -> Result<WasmExecutionOutputV1, WasmExecutionErrorV1> {
    let budget = ACTIVE.with(|slot| slot.borrow().clone());
    match budget {
        Some(budget) => budget.borrow_mut().execute(executor, input),
        None => executor.execute_bounded(input),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nested_scopes_share_the_account_and_only_the_outer_scope_clears_it() {
        let outer = OperationScope::enter();
        let first = ACTIVE.with(|slot| slot.borrow().clone().unwrap());
        {
            let _nested = OperationScope::enter();
            assert!(ACTIVE.with(|slot| Rc::ptr_eq(slot.borrow().as_ref().unwrap(), &first)));
        }
        assert!(ACTIVE.with(|slot| Rc::ptr_eq(slot.borrow().as_ref().unwrap(), &first)));
        std::thread::spawn(|| {
            assert!(ACTIVE.with(|slot| slot.borrow().is_none()));
            let _other_thread = OperationScope::enter();
        })
        .join()
        .unwrap();
        drop(outer);
        assert!(ACTIVE.with(|slot| slot.borrow().is_none()));
        let _next = OperationScope::enter();
        assert!(ACTIVE.with(|slot| !Rc::ptr_eq(slot.borrow().as_ref().unwrap(), &first)));
    }

    #[test]
    fn unwinding_releases_the_outer_account() {
        let result = std::panic::catch_unwind(|| {
            let _scope = OperationScope::enter();
            panic!("simulated host panic");
        });
        assert!(result.is_err());
        assert!(ACTIVE.with(|slot| slot.borrow().is_none()));
        let _next = OperationScope::enter();
        assert!(!operation_failed());
    }
}
