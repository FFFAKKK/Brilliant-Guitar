use std::cell::Cell;

use brilliant_kernel_contracts::{
    KernelStage3CommandFailureLeafV1 as Failure, KernelStage3MetricsV1,
    KernelStage3ResourceLimitKindV1,
};

/// Deterministic Rust-kernel work envelope for one transaction. Host callback
/// CPU remains the plugin platform's responsibility; this budget covers work
/// whose progress is controlled by the kernel itself.
pub(crate) const MAX_TRANSACTION_WORK_UNITS_V1: u64 = 8 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct State {
    accounted_metrics: u64,
    precharged_metrics: u64,
    supplemental: u64,
    exceeded_at: Option<u64>,
}

#[derive(Debug)]
pub(crate) struct TransactionWorkBudgetV1 {
    state: Cell<State>,
    limit: u64,
}

impl Default for TransactionWorkBudgetV1 {
    fn default() -> Self {
        Self {
            state: Cell::new(State::default()),
            limit: MAX_TRANSACTION_WORK_UNITS_V1,
        }
    }
}

impl TransactionWorkBudgetV1 {
    pub(crate) fn observe_metrics(&self, metrics: &KernelStage3MetricsV1) -> Result<(), Failure> {
        let observed = metric_work_units(metrics);
        let mut state = self.state.get();
        let newly_observed = observed.saturating_sub(state.accounted_metrics);
        state.precharged_metrics = state.precharged_metrics.saturating_sub(newly_observed);
        state.accounted_metrics = state.accounted_metrics.max(observed);
        self.publish(state)
    }

    /// Reserve metric-backed progress before a long traversal publishes its
    /// counters. Later `observe_metrics` calls consume this credit, preventing
    /// double charging while still allowing the loop to stop at the limit.
    pub(crate) fn charge_metric_progress(&self, units: u64) -> Result<(), Failure> {
        let mut state = self.state.get();
        state.precharged_metrics = state.precharged_metrics.saturating_add(units);
        self.publish(state)
    }

    /// Charge deterministic work not represented by Stage 3 metrics, such as
    /// walking a retained journal during history replay.
    pub(crate) fn charge_supplemental(&self, units: u64) -> Result<(), Failure> {
        let mut state = self.state.get();
        state.supplemental = state.supplemental.saturating_add(units);
        self.publish(state)
    }

    pub(crate) fn ensure_active(&self) -> Result<(), Failure> {
        let state = self.state.get();
        match state.exceeded_at {
            Some(actual) => Err(resource_failure(self.limit, actual)),
            None => Ok(()),
        }
    }

    fn publish(&self, mut state: State) -> Result<(), Failure> {
        if let Some(actual) = state.exceeded_at {
            self.state.set(state);
            return Err(resource_failure(self.limit, actual));
        }
        let actual = state
            .accounted_metrics
            .saturating_add(state.precharged_metrics)
            .saturating_add(state.supplemental);
        if actual > self.limit {
            state.exceeded_at = Some(actual);
        }
        self.state.set(state);
        match state.exceeded_at {
            Some(actual) => Err(resource_failure(self.limit, actual)),
            None => Ok(()),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_limit(limit: u64) -> Self {
        Self {
            state: Cell::new(State::default()),
            limit,
        }
    }

    #[cfg(test)]
    pub(crate) fn used(&self) -> u64 {
        let state = self.state.get();
        state
            .accounted_metrics
            .saturating_add(state.precharged_metrics)
            .saturating_add(state.supplemental)
    }

    #[cfg(test)]
    pub(crate) fn set_limit(&mut self, limit: u64) {
        self.limit = limit;
    }
}

pub(crate) fn metric_work_units(metrics: &KernelStage3MetricsV1) -> u64 {
    [
        metrics.semantic_rules_evaluated,
        metrics.semantic_dependency_reads,
        metrics.entities_visited,
        metrics.entity_index_lookups,
        metrics.owner_index_lookups,
        metrics.time_index_comparisons,
        metrics.overlay_records,
        metrics.order_collections_copied,
        metrics.change_ops,
        metrics.affected_addresses,
        metrics.index_entries_removed,
        metrics.index_entries_inserted,
    ]
    .into_iter()
    .fold(0_u64, u64::saturating_add)
}

fn resource_failure(limit: u64, actual: u64) -> Failure {
    Failure::ResourceLimitExceeded {
        limit_kind: KernelStage3ResourceLimitKindV1::TransactionWorkUnits,
        limit,
        actual,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_boundary_is_accepted_and_first_excess_is_sticky() {
        let budget = TransactionWorkBudgetV1::with_limit(3);
        let metrics = KernelStage3MetricsV1 {
            entities_visited: 2,
            entity_index_lookups: 1,
            ..KernelStage3MetricsV1::default()
        };
        budget.observe_metrics(&metrics).unwrap();
        assert_eq!(budget.used(), 3);

        let first = budget.charge_supplemental(1).unwrap_err();
        assert_eq!(
            first,
            Failure::ResourceLimitExceeded {
                limit_kind: KernelStage3ResourceLimitKindV1::TransactionWorkUnits,
                limit: 3,
                actual: 4,
            }
        );
        assert_eq!(budget.ensure_active().unwrap_err(), first);
        assert_eq!(budget.charge_supplemental(100).unwrap_err(), first);
    }

    #[test]
    fn observed_metrics_consume_precharged_progress_without_double_counting() {
        let budget = TransactionWorkBudgetV1::with_limit(3);
        budget.charge_metric_progress(2).unwrap();
        assert_eq!(budget.used(), 2);
        budget
            .observe_metrics(&KernelStage3MetricsV1 {
                entities_visited: 2,
                ..KernelStage3MetricsV1::default()
            })
            .unwrap();
        assert_eq!(budget.used(), 2);
    }
}
