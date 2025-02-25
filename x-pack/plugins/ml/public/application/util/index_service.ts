/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataView, DataViewsContract } from '@kbn/data-views-plugin/public';
import type { Job } from '../../../common/types/anomaly_detection_jobs';

// TODO Consolidate with legacy code in `ml/public/application/util/index_utils.ts`.
export function indexServiceFactory(dataViewsService: DataViewsContract) {
  return {
    /**
     * Retrieves the data view ID from the given name.
     * If a job is passed in, a temporary data view will be created if the requested data view doesn't exist.
     * @param name - The name or index pattern of the data view.
     * @param job - Optional job object.
     * @returns The data view ID or null if it doesn't exist.
     */
    async getDataViewIdFromName(name: string, job?: Job): Promise<string | null> {
      if (dataViewsService === null) {
        throw new Error('Data views are not initialized!');
      }
      const dataViews = await dataViewsService.find(name);
      const dataView = dataViews.find((dv) => dv.getIndexPattern() === name);
      if (!dataView) {
        if (job !== undefined) {
          const tempDataView = await dataViewsService.create({
            id: undefined,
            name,
            title: name,
            timeFieldName: job.data_description.time_field!,
          });
          return tempDataView.id ?? null;
        }
        return null;
      }
      return dataView.id ?? dataView.getIndexPattern();
    },
    getDataViewById(id: string): Promise<DataView> {
      if (dataViewsService === null) {
        throw new Error('Data views are not initialized!');
      }

      if (id) {
        return dataViewsService.get(id);
      } else {
        return dataViewsService.create({});
      }
    },
  };
}

export type MlIndexUtils = ReturnType<typeof indexServiceFactory>;
