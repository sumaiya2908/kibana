/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createApiLogic } from '../../../shared/api_logic/create_api_logic';
import { HttpLogic } from '../../../shared/http';

export interface ApiKey {
  api_key: string;
  encoded: string;
  id: string;
  name: string;
}

export const generateApiKey = async ({
  indexName,
  isNative,
  secretId,
}: {
  indexName: string;
  isNative: boolean;
  secretId: string | null;
}) => {
  const route = `/internal/enterprise_search/indices/${indexName}/api_key`;
  const params = {
    is_native: isNative,
    secret_id: secretId,
  };
  return await HttpLogic.values.http.post<ApiKey>(route, {
    body: JSON.stringify(params),
  });
};

export const GenerateConnectorApiKeyApiLogic = createApiLogic(
  ['generate_connector_api_key_api_logic'],
  generateApiKey
);
