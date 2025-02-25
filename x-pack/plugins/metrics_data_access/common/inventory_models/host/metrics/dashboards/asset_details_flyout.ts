/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createDashboardModel } from '../../../create_dashboard_model';
import {
  createBasicCharts,
  diskSpaceUsageAvailable,
  diskUsageByMountPoint,
  diskIOReadWrite,
  diskThroughputReadWrite,
  rxTx,
} from '../charts';

export const assetDetailsFlyout = {
  get: ({
    metricsDataViewId,
    logsDataViewId,
  }: {
    metricsDataViewId?: string;
    logsDataViewId?: string;
  }) => {
    const { cpuUsage, memoryUsage } = createBasicCharts({
      chartType: 'xy',
      fromFormulas: ['cpuUsage', 'memoryUsage'],
      chartConfig: {
        yBounds: {
          mode: 'custom',
          lowerBound: 0,
          upperBound: 1,
        },
      },
      dataViewId: metricsDataViewId,
    });

    const { normalizedLoad1m } = createBasicCharts({
      chartType: 'xy',
      fromFormulas: ['normalizedLoad1m'],
      dataViewId: metricsDataViewId,
    });
    normalizedLoad1m.layers.push({ type: 'reference', yAxis: [{ value: '1' }] });

    const { logRate } = createBasicCharts({
      chartType: 'xy',
      fromFormulas: ['logRate'],
      dataViewId: logsDataViewId,
    });

    return createDashboardModel({
      charts: [
        cpuUsage,
        memoryUsage,
        normalizedLoad1m,
        logRate,
        diskSpaceUsageAvailable.get({ dataViewId: metricsDataViewId }),
        diskUsageByMountPoint.get({ dataViewId: metricsDataViewId }),
        diskThroughputReadWrite.get({ dataViewId: metricsDataViewId }),
        diskIOReadWrite.get({ dataViewId: metricsDataViewId }),
        rxTx.get({ dataViewId: metricsDataViewId }),
      ],
    });
  },
};
