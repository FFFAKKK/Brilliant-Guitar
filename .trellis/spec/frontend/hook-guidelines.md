# Reserved Hook Guidelines

React hooks are out of scope for Pure Core Kernel V1.

Do not introduce React hooks or browser state management to solve kernel concerns. Kernel reads must use snapshot/selector contracts; kernel writes must use semantic commands.

