/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FtrProviderContext } from './config';

export default function ({ loadTestFile }: FtrProviderContext) {
  describe('Observability Logs Explorer', function () {
    loadTestFile(require.resolve('./app'));
    loadTestFile(require.resolve('./columns_selection'));
    loadTestFile(require.resolve('./dataset_selection_state'));
    loadTestFile(require.resolve('./dataset_selector'));
    loadTestFile(require.resolve('./filter_controls'));
    loadTestFile(require.resolve('./flyout'));
    loadTestFile(require.resolve('./header_menu'));
    loadTestFile(require.resolve('./flyout_highlights.ts'));
    loadTestFile(require.resolve('./custom_control_columns.ts'));
  });
}
