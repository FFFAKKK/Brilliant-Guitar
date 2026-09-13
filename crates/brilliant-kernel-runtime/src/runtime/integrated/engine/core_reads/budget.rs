//! One synchronous runtime operation, including nested entry into another
//! integrated session. Accounts never contain a candidate or a read handle.
use std::{cell::RefCell, rc::Rc};

use super::{Failure, Result};

const MAX_OPERATION_QUERIES: usize = 4096;
const MAX_OPERATION_REPLY_BYTES: usize = 32 * 1024 * 1024;
const MAX_OPERATION_INDEX_VISITS: usize = 1_048_576;

pub(super) struct Budget {
    queries: usize,
    reply_bytes: usize,
    index_visits: usize,
    failed: bool,
}

impl Default for Budget {
    fn default() -> Self {
        Self {
            queries: MAX_OPERATION_QUERIES,
            reply_bytes: MAX_OPERATION_REPLY_BYTES,
            index_visits: MAX_OPERATION_INDEX_VISITS,
            failed: false,
        }
    }
}

pub(super) type Account = Rc<RefCell<Budget>>;
thread_local! {
    static ACTIVE: RefCell<Option<Account>> = const { RefCell::new(None) };
}

pub(in super::super) struct OperationScope {
    owner: bool,
}

impl OperationScope {
    pub(in super::super) fn enter() -> Self {
        ACTIVE.with(|slot| {
            let mut slot = slot.borrow_mut();
            let owner = slot.is_none();
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

pub(super) fn current() -> Account {
    ACTIVE.with(|slot| {
        slot.borrow()
            .clone()
            .unwrap_or_else(|| Rc::new(RefCell::new(Budget::default())))
    })
}

impl Budget {
    pub(super) fn failed(&self) -> bool {
        self.failed
    }
    pub(super) fn poison(&mut self) {
        self.failed = true;
    }
    pub(super) fn query(&mut self) -> Result<()> {
        if self.failed || self.queries == 0 {
            self.poison();
            return Err(Failure::ResourceLimit);
        }
        self.queries -= 1;
        Ok(())
    }
    pub(super) fn visit(&mut self) -> Result<()> {
        if self.failed || self.index_visits == 0 {
            self.poison();
            return Err(Failure::ResourceLimit);
        }
        self.index_visits -= 1;
        Ok(())
    }
    pub(super) fn remaining_reply_bytes(&self) -> usize {
        self.reply_bytes
    }
    pub(super) fn charge_reply(&mut self, bytes: usize) -> Result<()> {
        if self.failed || bytes > self.reply_bytes {
            self.poison();
            return Err(Failure::ResourceLimit);
        }
        self.reply_bytes -= bytes;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nested_scope_shares_limits_and_unwind_restores_independent_operations() {
        let result = std::panic::catch_unwind(|| {
            let _outer = OperationScope::enter();
            let first = current();
            {
                let _inner = OperationScope::enter();
                assert!(Rc::ptr_eq(&first, &current()));
                current().borrow_mut().poison();
            }
            assert!(first.borrow().failed());
            std::thread::spawn(|| {
                let _other = OperationScope::enter();
                assert!(!current().borrow().failed());
            })
            .join()
            .unwrap();
            panic!("simulated callback unwind");
        });
        assert!(result.is_err());
        assert!(ACTIVE.with(|slot| slot.borrow().is_none()));
        let _next = OperationScope::enter();
        assert!(!current().borrow().failed());
    }
}
