/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import type { KibanaExecutionContext } from '@kbn/core/public';
import { Adapters } from '@kbn/inspector-plugin/public';
import { ExecutionContextSearch } from '@kbn/es-query';
import {
  IInterpreterRenderHandlers,
  ExpressionValue,
  ExpressionsService,
  RenderMode,
  IInterpreterRenderEvent,
} from '../../common';
import { ExpressionRenderHandlerParams } from '../render';

/**
 * @deprecated
 *
 * This type if remainder from legacy platform, will be deleted going further.
 */
export interface ExpressionExecutor {
  interpreter: ExpressionInterpreter;
}

/**
 * @deprecated
 */
export interface ExpressionInterpreter {
  interpretAst: ExpressionsService['run'];
}

export interface IExpressionLoaderParams {
  searchContext?: ExecutionContextSearch;
  context?: ExpressionValue;
  variables?: Record<string, unknown>;
  // Enables debug tracking on each expression in the AST
  debug?: boolean;
  disableCaching?: boolean;
  customFunctions?: [];
  customRenderers?: [];
  uiState?: unknown;
  inspectorAdapters?: Adapters;
  interactive?: boolean;
  onRenderError?: RenderErrorHandlerFnType;
  searchSessionId?: string;
  renderMode?: RenderMode;
  syncColors?: boolean;
  syncCursor?: boolean;
  syncTooltips?: boolean;
  // if this is set to true, a veil will be shown when resizing visualizations in response
  // to a chart resize event (see src/plugins/chart_expressions/common/chart_size_transition_veil.tsx).
  // This should be only set to true if the client will be responding to the resize events
  shouldUseSizeTransitionVeil?: boolean;
  hasCompatibleActions?: ExpressionRenderHandlerParams['hasCompatibleActions'];
  getCompatibleCellValueActions?: ExpressionRenderHandlerParams['getCompatibleCellValueActions'];
  executionContext?: KibanaExecutionContext;
  abortController?: AbortController;
  /**
   * The flag to toggle on emitting partial results.
   * By default, the partial results are disabled.
   */
  partial?: boolean;

  /**
   * Throttling of partial results in milliseconds. 0 is disabling the throttling.
   * By default, it equals 1000.
   */
  throttle?: number;
}

export interface ExpressionRenderError extends Error {
  type?: string;
  original?: Error;
}

export type RenderErrorHandlerFnType = (
  domNode: HTMLElement,
  error: ExpressionRenderError,
  handlers: IInterpreterRenderHandlers
) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExpressionRendererEvent = IInterpreterRenderEvent<any>;
