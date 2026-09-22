import {Args} from '@oclif/core'

import {BaseCommand} from '../../base-command.js'
import type {ApiResponse, RequestOptions} from '@polymorfa/sdk'

import {
  operationsFor,
  type OperationRecord,
  type OperationsClient,
} from '../../developer/operations.js'
import {developerResponse} from '../../developer/output.js'
import {CliConditionError} from '../../errors/conditions.js'
import {
  TERMINAL_STATUSES,
  renderOperationLine,
  waitFlags,
} from '../../developer/operation-view.js'

export default class OperationWatch extends BaseCommand {
  static override args = {
    operation: Args.string({description: 'Operation ID.', required: true}),
  }

  static override description =
    'Print each status change of an operation until it succeeds, fails, or is cancelled. With --json, prints one JSON document per change. Exits like operation wait.'

  static override flags = waitFlags

  async run(): Promise<void> {
    const {args, flags} = await this.parse(OperationWatch)
    // --timeout here is the wait budget in seconds. It replaces the global
    // per-request timeout (milliseconds), so it must not reach the client.
    const session = await this.developerSession({...flags, timeout: undefined})
    const deadline = Date.now() + flags.timeout * 1000
    let afterSequence: number | undefined
    for (;;) {
      const operations = operationsFor(session)
      // The first read reports the current state; later reads long-poll
      // for the next transition.
      const response =
        afterSequence === undefined
          ? await this.firstRead(
              operations,
              args.operation,
              session.requestOptions,
              deadline,
              flags.timeout,
            )
          : await operations.wait(args.operation, {
              afterSequence,
              maxWaitMs: Math.max(0, deadline - Date.now()),
              requestOptions: session.requestOptions,
            })
      const operation = response.data
      if (afterSequence === undefined || operation.sequence > afterSequence) {
        this.writeValue(
          developerResponse(response, session.context),
          renderOperationLine(operation),
          flags,
        )
        afterSequence = operation.sequence
      }
      if (TERMINAL_STATUSES.has(operation.status)) {
        if (operation.status !== 'succeeded') process.exitCode = 1
        return
      }
      if (Date.now() >= deadline) {
        throw new CliConditionError(
          'action_required',
          `Operation ${operation.id} is still ${operation.status} after ${flags.timeout} seconds.`,
        )
      }
    }
  }

  /**
   * The first read reports the current state. It gets the same budget as
   * --timeout (at least one second to answer), so a server that never
   * replies cannot hold the watch past its deadline.
   */
  private async firstRead(
    operations: OperationsClient,
    operationId: string,
    requestOptions: RequestOptions,
    deadline: number,
    timeout: number,
  ): Promise<ApiResponse<OperationRecord>> {
    const budget = new AbortController()
    const timer = setTimeout(
      () => budget.abort(),
      Math.max(deadline - Date.now(), 1000),
    )
    try {
      return await operations.get(
        operationId,
        {},
        {...requestOptions, signal: budget.signal},
      )
    } catch (error) {
      if (!budget.signal.aborted) throw error
      throw new CliConditionError(
        'action_required',
        `Operation ${operationId} did not report its state within ${timeout} seconds.`,
      )
    } finally {
      clearTimeout(timer)
    }
  }
}
