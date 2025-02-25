/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  BoolQuery,
  buildEsQuery,
  Filter,
  fromKueryExpression,
  toElasticsearchQuery,
} from '@kbn/es-query';
import { SearchConfigurationType } from '../lib/rules/custom_threshold/types';

export const getParsedFilterQuery: (filter: string | undefined) => Array<Record<string, any>> = (
  filter
) => {
  if (!filter) return [];

  try {
    const parsedQuery = toElasticsearchQuery(fromKueryExpression(filter));
    return [parsedQuery];
  } catch (error) {
    return [];
  }
};

export const getSearchConfigurationBoolQuery: (
  searchConfiguration: SearchConfigurationType,
  additionalFilters: Filter[]
) => { bool: BoolQuery } = (searchConfiguration, additionalFilters) => {
  try {
    const searchConfigurationFilters = (searchConfiguration.filter as Filter[]) || [];
    const filters = [...additionalFilters, ...searchConfigurationFilters];

    return buildEsQuery(undefined, searchConfiguration.query, filters, {});
  } catch (error) {
    return {
      bool: {
        must: [],
        must_not: [],
        filter: [],
        should: [],
      },
    };
  }
};
