/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TransformPutTransformRequest } from '@elastic/elasticsearch/lib/api/types';
import {
  ALL_VALUE,
  apmTransactionErrorRateIndicatorSchema,
  timeslicesBudgetingMethodSchema,
} from '@kbn/slo-schema';
import { estypes } from '@elastic/elasticsearch';
import { getElasticsearchQueryOrThrow, TransformGenerator } from '.';
import {
  getSLOTransformId,
  SLO_DESTINATION_INDEX_NAME,
  SLO_INGEST_PIPELINE_NAME,
} from '../../../../common/slo/constants';
import { getSLOTransformTemplate } from '../../../assets/transform_templates/slo_transform_template';
import { APMTransactionErrorRateIndicator, SLO } from '../../../domain/models';
import { InvalidTransformError } from '../../../errors';
import { parseIndex } from './common';

export class ApmTransactionErrorRateTransformGenerator extends TransformGenerator {
  public getTransformParams(slo: SLO): TransformPutTransformRequest {
    if (!apmTransactionErrorRateIndicatorSchema.is(slo.indicator)) {
      throw new InvalidTransformError(`Cannot handle SLO of indicator type: ${slo.indicator.type}`);
    }

    return getSLOTransformTemplate(
      this.buildTransformId(slo),
      this.buildDescription(slo),
      this.buildSource(slo, slo.indicator),
      this.buildDestination(),
      this.buildGroupBy(slo, slo.indicator),
      this.buildAggregations(slo),
      this.buildSettings(slo)
    );
  }

  private buildTransformId(slo: SLO): string {
    return getSLOTransformId(slo.id, slo.revision);
  }

  private buildGroupBy(slo: SLO, indicator: APMTransactionErrorRateIndicator) {
    // These groupBy fields must match the fields from the source query, otherwise
    // the transform will create permutations for each value present in the source.
    // E.g. if environment is not specified in the source query, but we include it in the groupBy,
    // we'll output documents for each environment value
    const extraGroupByFields = {
      ...(indicator.params.service !== ALL_VALUE && {
        'service.name': { terms: { field: 'service.name' } },
      }),
      ...(indicator.params.environment !== ALL_VALUE && {
        'service.environment': { terms: { field: 'service.environment' } },
      }),
      ...(indicator.params.transactionName !== ALL_VALUE && {
        'transaction.name': { terms: { field: 'transaction.name' } },
      }),
      ...(indicator.params.transactionType !== ALL_VALUE && {
        'transaction.type': { terms: { field: 'transaction.type' } },
      }),
    };

    return this.buildCommonGroupBy(slo, '@timestamp', extraGroupByFields);
  }

  private buildSource(slo: SLO, indicator: APMTransactionErrorRateIndicator) {
    const queryFilter: estypes.QueryDslQueryContainer[] = [
      {
        range: {
          '@timestamp': {
            gte: `now-${slo.timeWindow.duration.format()}/d`,
          },
        },
      },
    ];

    if (indicator.params.service !== ALL_VALUE) {
      queryFilter.push({
        match: {
          'service.name': indicator.params.service,
        },
      });
    }

    if (indicator.params.environment !== ALL_VALUE) {
      queryFilter.push({
        match: {
          'service.environment': indicator.params.environment,
        },
      });
    }

    if (indicator.params.transactionName !== ALL_VALUE) {
      queryFilter.push({
        match: {
          'transaction.name': indicator.params.transactionName,
        },
      });
    }

    if (indicator.params.transactionType !== ALL_VALUE) {
      queryFilter.push({
        match: {
          'transaction.type': indicator.params.transactionType,
        },
      });
    }

    if (indicator.params.filter) {
      queryFilter.push(getElasticsearchQueryOrThrow(indicator.params.filter));
    }

    return {
      index: parseIndex(indicator.params.index),
      runtime_mappings: this.buildCommonRuntimeMappings(slo),
      query: {
        bool: {
          filter: [
            { term: { 'metricset.name': 'transaction' } },
            { terms: { 'event.outcome': ['success', 'failure'] } },
            ...queryFilter,
          ],
        },
      },
    };
  }

  private buildDestination() {
    return {
      pipeline: SLO_INGEST_PIPELINE_NAME,
      index: SLO_DESTINATION_INDEX_NAME,
    };
  }

  private buildAggregations(slo: SLO) {
    return {
      'slo.numerator': {
        filter: {
          bool: {
            should: {
              match: {
                'event.outcome': 'success',
              },
            },
          },
        },
      },
      'slo.denominator': {
        filter: {
          match_all: {},
        },
      },
      ...(timeslicesBudgetingMethodSchema.is(slo.budgetingMethod) && {
        'slo.isGoodSlice': {
          bucket_script: {
            buckets_path: {
              goodEvents: 'slo.numerator>_count',
              totalEvents: 'slo.denominator>_count',
            },
            script: `params.goodEvents / params.totalEvents >= ${slo.objective.timesliceTarget} ? 1 : 0`,
          },
        },
      }),
    };
  }
}
