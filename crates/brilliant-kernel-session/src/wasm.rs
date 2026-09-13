//! Private, versioned execution source. No Store or editing authority enters Wasm.
use crate::{ContributionExecutionFailureV2, ContributionExecutorV2};
use sha2::{Digest, Sha256};
use wasmi::{
    CompilationMode, Config, EnforcedLimits, Engine, ExternType, Linker, Module, Store,
    StoreLimitsBuilder, TrapCode, ValType,
};

const PAGE: usize = 65_536;
const MAX_ARTIFACT_BYTES: usize = 4 * 1024 * 1024;

/// Host policy, never supplied by guest output. Limits can only tighten V1 caps.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct WasmLimitsV1 {
    pub fuel: u64,
    pub memory_bytes: usize,
    pub input_bytes: usize,
    pub output_bytes: usize,
}

impl Default for WasmLimitsV1 {
    fn default() -> Self {
        Self {
            fuel: 10_000_000,
            memory_bytes: 64 * 1024 * 1024,
            input_bytes: 16 * 1024 * 1024,
            output_bytes: 16 * 1024 * 1024,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WasmExecutionErrorV1 {
    InvalidLimits,
    ArtifactTooLarge,
    HashMismatch,
    UnsupportedAbi,
    InvalidModule,
    ImportsForbidden,
    InputTooLarge,
    FuelExhausted,
    CallLimitExceeded,
    StackExhausted,
    Trap,
    InvalidInputRegion,
    InvalidOutputRegion,
    OutputTooLarge,
}

#[derive(Debug, Eq, PartialEq)]
pub struct WasmExecutionOutputV1 {
    pub bytes: Vec<u8>,
    /// Includes guest start, allocation and execution, not host compilation/copy.
    pub fuel_consumed: u64,
}

/// Shared by every guest in one host operation. Failures are sticky; a caller
/// cannot catch an exhausted guest and resume admission using another guest.
pub struct WasmOperationBudgetV1 {
    fuel: u64,
    calls: u32,
    failed: bool,
}

impl Default for WasmOperationBudgetV1 {
    fn default() -> Self {
        Self {
            fuel: 100_000_000,
            calls: 4096,
            failed: false,
        }
    }
}

impl WasmOperationBudgetV1 {
    pub fn failed(&self) -> bool {
        self.failed
    }

    pub fn execute(
        &mut self,
        executor: &WasmExecutorV1,
        input: &[u8],
    ) -> Result<WasmExecutionOutputV1, WasmExecutionErrorV1> {
        if self.failed || self.fuel == 0 {
            self.failed = true;
            return Err(WasmExecutionErrorV1::FuelExhausted);
        }
        if self.calls == 0 {
            self.failed = true;
            return Err(WasmExecutionErrorV1::CallLimitExceeded);
        }
        self.calls -= 1;
        // Remains failed on any error or unwind, including allocation/start traps.
        self.failed = true;
        let output = executor.execute_with_fuel(input, self.fuel.min(executor.limits.fuel))?;
        self.fuel -= output.fuel_consumed;
        self.failed = false;
        Ok(output)
    }
}

/// Captured compiled bytes and their hash are immutable after construction.
/// A digest proves byte integrity, not module authorization or SDK authenticity.
pub struct WasmExecutorV1 {
    engine: Engine,
    module: Module,
    digest: [u8; 32],
    limits: WasmLimitsV1,
}

impl WasmExecutorV1 {
    pub fn capture(
        bytes: &[u8],
        expected_sha256: [u8; 32],
        abi_version: u32,
        limits: WasmLimitsV1,
    ) -> Result<Self, WasmExecutionErrorV1> {
        let max = WasmLimitsV1::default();
        if limits.fuel == 0
            || limits.fuel > max.fuel
            || limits.memory_bytes < PAGE
            || limits.memory_bytes > max.memory_bytes
            || !limits.memory_bytes.is_multiple_of(PAGE)
            || limits.input_bytes > max.input_bytes
            || limits.output_bytes > max.output_bytes
        {
            return Err(WasmExecutionErrorV1::InvalidLimits);
        }
        if bytes.len() > MAX_ARTIFACT_BYTES {
            return Err(WasmExecutionErrorV1::ArtifactTooLarge);
        }
        if abi_version != 1 {
            return Err(WasmExecutionErrorV1::UnsupportedAbi);
        }
        let digest: [u8; 32] = Sha256::digest(bytes).into();
        if digest != expected_sha256 {
            return Err(WasmExecutionErrorV1::HashMismatch);
        }
        let mut config = Config::default();
        config
            .consume_fuel(true)
            .compilation_mode(CompilationMode::Eager)
            .enforced_limits(EnforcedLimits::strict())
            .set_max_recursion_depth(256)
            .set_min_stack_height(1024)
            .set_max_stack_height(65_536)
            .set_max_cached_stacks(0)
            .wasm_multi_memory(false)
            .wasm_custom_page_sizes(false)
            .wasm_tail_call(false);
        // memory64 and SIMD are disabled at dependency feature selection.
        let engine = Engine::new(&config);
        let module =
            Module::new(&engine, bytes).map_err(|_| WasmExecutionErrorV1::InvalidModule)?;
        if module.imports().next().is_some() {
            return Err(WasmExecutionErrorV1::ImportsForbidden);
        }
        if module.exports().count() != 3 {
            return Err(WasmExecutionErrorV1::UnsupportedAbi);
        }
        let Some(ExternType::Memory(memory)) = module.get_export("memory") else {
            return Err(WasmExecutionErrorV1::UnsupportedAbi);
        };
        if memory.is_64() || memory.minimum() > (limits.memory_bytes / PAGE) as u64 {
            return Err(WasmExecutionErrorV1::UnsupportedAbi);
        }
        for (name, params, results) in [
            (
                "brilliant_alloc_v1",
                &[ValType::I32][..],
                &[ValType::I32][..],
            ),
            (
                "brilliant_execute_v1",
                &[ValType::I32, ValType::I32][..],
                &[ValType::I64][..],
            ),
        ] {
            let Some(ExternType::Func(function)) = module.get_export(name) else {
                return Err(WasmExecutionErrorV1::UnsupportedAbi);
            };
            if function.params() != params || function.results() != results {
                return Err(WasmExecutionErrorV1::UnsupportedAbi);
            }
        }
        Ok(Self {
            engine,
            module,
            digest,
            limits,
        })
    }

    pub fn sha256(&self) -> [u8; 32] {
        self.digest
    }

    /// A fresh instance per call prevents hidden guest state between callbacks.
    /// The allocator returns a wasm32 byte offset. Execute returns an i64 whose
    /// high 32 bits are the output offset and low 32 bits are the output length.
    /// Regions may alias: input is copied before execution, output is copied out
    /// before the instance is dropped. Runtime still validates response semantics.
    pub fn execute_bounded(
        &self,
        input: &[u8],
    ) -> Result<WasmExecutionOutputV1, WasmExecutionErrorV1> {
        self.execute_with_fuel(input, self.limits.fuel)
    }

    fn execute_with_fuel(
        &self,
        input: &[u8],
        fuel: u64,
    ) -> Result<WasmExecutionOutputV1, WasmExecutionErrorV1> {
        if input.len() > self.limits.input_bytes {
            return Err(WasmExecutionErrorV1::InputTooLarge);
        }
        let limits = StoreLimitsBuilder::new()
            .memory_size(self.limits.memory_bytes)
            .memories(1)
            .tables(8)
            .table_elements(16_384)
            .instances(1)
            .trap_on_grow_failure(true)
            .build();
        let mut store = Store::new(&self.engine, limits);
        store.limiter(|limits| limits);
        store.set_fuel(fuel).map_err(map_error)?;
        // There are no imports, including WASI, clocks, random, files or network.
        let instance = Linker::new(&self.engine)
            .instantiate_and_start(&mut store, &self.module)
            .map_err(map_error)?;
        let memory = instance
            .get_memory(&store, "memory")
            .ok_or(WasmExecutionErrorV1::UnsupportedAbi)?;
        let allocate = instance
            .get_typed_func::<i32, i32>(&store, "brilliant_alloc_v1")
            .map_err(map_error)?;
        let execute = instance
            .get_typed_func::<(i32, i32), i64>(&store, "brilliant_execute_v1")
            .map_err(map_error)?;
        let offset = allocate
            .call(&mut store, input.len() as i32)
            .map_err(map_error)?;
        memory
            .write(&mut store, offset as u32 as usize, input)
            .map_err(|_| WasmExecutionErrorV1::InvalidInputRegion)?;
        let packed = execute
            .call(&mut store, (offset, input.len() as i32))
            .map_err(map_error)? as u64;
        let output_offset = (packed >> 32) as usize;
        let output_len = (packed as u32) as usize;
        if output_len > self.limits.output_bytes {
            return Err(WasmExecutionErrorV1::OutputTooLarge);
        }
        let end = output_offset
            .checked_add(output_len)
            .ok_or(WasmExecutionErrorV1::InvalidOutputRegion)?;
        let bytes = memory
            .data(&store)
            .get(output_offset..end)
            .ok_or(WasmExecutionErrorV1::InvalidOutputRegion)?
            .to_vec();
        let fuel_consumed = fuel - store.get_fuel().map_err(map_error)?;
        Ok(WasmExecutionOutputV1 {
            bytes,
            fuel_consumed,
        })
    }
}

impl ContributionExecutorV2 for WasmExecutorV1 {
    fn execute(&mut self, request: &[u8]) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
        self.execute_bounded(request)
            .map(|output| output.bytes)
            .map_err(|_| ContributionExecutionFailureV2::Callback)
    }
}

fn map_error(error: wasmi::Error) -> WasmExecutionErrorV1 {
    match error.as_trap_code() {
        Some(TrapCode::OutOfFuel) => WasmExecutionErrorV1::FuelExhausted,
        Some(TrapCode::StackOverflow) => WasmExecutionErrorV1::StackExhausted,
        _ => WasmExecutionErrorV1::Trap,
    }
}

#[cfg(test)]
mod tests;
