/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DoneInvokeEvent } from 'xstate';
import { Direction, SortField } from '../../../hooks';
import { DegradedDocsStat } from '../../../../common/data_streams_stats/malformed_docs_stat';
import {
  DataStreamDegradedDocsStatServiceResponse,
  DataStreamDetails,
  DataStreamStatServiceResponse,
} from '../../../../common/data_streams_stats';
import { DataStreamStat } from '../../../../common/data_streams_stats/data_stream_stat';

export type FlyoutDataset = Omit<
  DataStreamStat,
  'type' | 'size' | 'sizeBytes' | 'lastActivity' | 'degradedDocs'
> & { type: string };

interface TableCriteria {
  page: number;
  rowsPerPage: number;
  sort: {
    field: SortField;
    direction: Direction;
  };
}

interface FiltersCriteria {
  inactive: boolean;
  fullNames: boolean;
  timeRange: {
    from: string;
    to: string;
  };
}

export interface WithTableOptions {
  table: TableCriteria;
}

export interface WithFlyoutOptions {
  flyout: {
    dataset?: FlyoutDataset;
    datasetDetails?: DataStreamDetails;
  };
}

export interface WithFilters {
  filters: FiltersCriteria;
}

export interface WithDataStreamStats {
  dataStreamStats: DataStreamStat[];
}

export interface WithDegradedDocs {
  degradedDocStats: DegradedDocsStat[];
}

export interface WithDatasets {
  datasets: DataStreamStat[];
}

export type DefaultDatasetQualityControllerState = WithTableOptions &
  Partial<WithDataStreamStats> &
  Partial<WithDegradedDocs> &
  WithFlyoutOptions &
  WithDatasets &
  WithFilters;

type DefaultDatasetQualityStateContext = DefaultDatasetQualityControllerState &
  Partial<WithFlyoutOptions>;

export type DatasetQualityControllerTypeState =
  | {
      value: 'datasets.fetching';
      context: DefaultDatasetQualityStateContext;
    }
  | {
      value: 'datasets.loaded';
      context: DefaultDatasetQualityStateContext;
    }
  | {
      value: 'datasets.loaded.idle';
      context: DefaultDatasetQualityStateContext;
    }
  | {
      value: 'datasets.loaded.flyoutOpen.fetching';
      context: DefaultDatasetQualityStateContext;
    }
  | {
      value: 'datasets.loaded.flyoutOpen';
      context: DefaultDatasetQualityStateContext;
    }
  | {
      value: 'degradedDocs.fetching';
      context: DefaultDatasetQualityStateContext;
    }
  | {
      value: 'datasets.loaded';
      context: DefaultDatasetQualityStateContext;
    };

export type DatasetQualityControllerContext = DatasetQualityControllerTypeState['context'];

export type DatasetQualityControllerEvent =
  | {
      type: 'UPDATE_TABLE_CRITERIA';
      criteria: TableCriteria;
    }
  | {
      type: 'OPEN_FLYOUT';
      dataset: FlyoutDataset;
    }
  | {
      type: 'SELECT_NEW_DATASET';
      dataset: FlyoutDataset;
    }
  | {
      type: 'CLOSE_FLYOUT';
    }
  | {
      type: 'TOGGLE_INACTIVE_DATASETS';
    }
  | {
      type: 'TOGGLE_FULL_DATASET_NAMES';
    }
  | DoneInvokeEvent<DataStreamDegradedDocsStatServiceResponse>
  | DoneInvokeEvent<DataStreamStatServiceResponse>
  | DoneInvokeEvent<Error>;
