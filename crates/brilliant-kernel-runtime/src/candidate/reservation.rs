//! Fallible collection growth for a candidate that can only be discarded after
//! capacity failure. This is not the compatibility logical-byte ledger: an
//! allocator/capacity failure must not masquerade as a declared byte limit.

use std::{
    collections::{HashMap, HashSet},
    hash::Hash,
};

use super::Failure;

#[derive(Clone, Copy)]
pub(super) enum Site {
    Nodes,
    IdPool,
    LookupKinds,
    LookupIds,
    LookupBucket,
    Orders,
    OrderEntries,
    HiddenRoots,
}

#[derive(Default)]
pub(super) struct Reservation {
    pub(super) attempts: usize,
    pub(super) sites: u16,
    #[cfg(test)]
    fail_at: Option<usize>,
    failed: bool,
}

impl Reservation {
    #[cfg(test)]
    pub(super) fn fail_at(attempt: usize) -> Self {
        Self {
            fail_at: Some(attempt),
            ..Self::default()
        }
    }

    pub(super) fn ensure_active(&self) -> Result<(), Failure> {
        if self.failed {
            Err(Failure::InternalError)
        } else {
            Ok(())
        }
    }

    fn reserve(
        &mut self,
        site: Site,
        reserve: impl FnOnce() -> Result<(), std::collections::TryReserveError>,
    ) -> Result<(), Failure> {
        self.ensure_active()?;
        let Some(attempt) = self.attempts.checked_add(1) else {
            self.failed = true;
            return Err(Failure::InternalError);
        };
        self.attempts = attempt;
        self.sites |= 1 << site as u16;
        #[cfg(test)]
        if self.fail_at == Some(attempt) {
            self.failed = true;
            return Err(Failure::InternalError);
        }
        if reserve().is_err() {
            self.failed = true;
            return Err(Failure::InternalError);
        }
        Ok(())
    }

    pub(super) fn vec<T>(
        &mut self,
        site: Site,
        values: &mut Vec<T>,
        additional: usize,
    ) -> Result<(), Failure> {
        self.reserve(site, || values.try_reserve(additional))
    }

    pub(super) fn map<K: Eq + Hash, V>(
        &mut self,
        site: Site,
        values: &mut HashMap<K, V>,
        additional: usize,
    ) -> Result<(), Failure> {
        self.reserve(site, || values.try_reserve(additional))
    }

    pub(super) fn set<T: Eq + Hash>(
        &mut self,
        site: Site,
        values: &mut HashSet<T>,
        additional: usize,
    ) -> Result<(), Failure> {
        self.reserve(site, || values.try_reserve(additional))
    }
}
