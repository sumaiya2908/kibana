/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import { DETECTION_ENGINE_RULES_URL } from '@kbn/security-solution-plugin/common/constants';
import { FtrProviderContext } from '../../../../../ftr_provider_context';
import {
  getSimpleRule,
  getSimpleRuleAsNdjson,
  getSimpleRuleOutput,
  removeServerGeneratedProperties,
  ruleToNdjson,
  updateUsername,
} from '../../../utils';
import {
  createAlertsIndex,
  deleteAllRules,
  deleteAllAlerts,
} from '../../../../../../common/utils/security_solution';

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const log = getService('log');
  const es = getService('es');
  const config = getService('config');
  const ELASTICSEARCH_USERNAME = config.get('servers.kibana.username');

  describe('@ess @serverless import_rules', () => {
    describe('importing rules with an index', () => {
      beforeEach(async () => {
        await createAlertsIndex(supertest, log);
      });

      afterEach(async () => {
        await deleteAllAlerts(supertest, log, es);
        await deleteAllRules(supertest, log);
      });

      it('should set the response content types to be expected', async () => {
        await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1']), 'rules.ndjson')
          .expect('Content-Type', 'application/json; charset=utf-8')
          .expect(200);
      });

      it('should reject with an error if the file type is not that of a ndjson', async () => {
        const { body } = await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1']), 'rules.txt')
          .expect(400);

        expect(body).to.eql({
          status_code: 400,
          message: 'Invalid file extension .txt',
        });
      });

      it('should report that it imported a simple rule successfully', async () => {
        const { body } = await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1']), 'rules.ndjson')
          .expect(200);

        expect(body).to.eql({
          errors: [],
          success: true,
          success_count: 1,
          rules_count: 1,
          exceptions_errors: [],
          exceptions_success: true,
          exceptions_success_count: 0,
          action_connectors_success: true,
          action_connectors_success_count: 0,
          action_connectors_errors: [],
          action_connectors_warnings: [],
        });
      });

      it('should be able to read an imported rule back out correctly', async () => {
        await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1']), 'rules.ndjson')
          .expect(200);

        const { body } = await supertest
          .get(`${DETECTION_ENGINE_RULES_URL}?rule_id=rule-1`)
          .set('elastic-api-version', '2023-10-31')
          .send()
          .expect(200);

        const bodyToCompare = removeServerGeneratedProperties(body);
        const expectedRule = updateUsername(
          {
            ...getSimpleRuleOutput('rule-1', false),
            output_index: '',
          },
          ELASTICSEARCH_USERNAME
        );

        expect(bodyToCompare).to.eql(expectedRule);
      });

      it('should fail validation when importing a rule with malformed "from" params on the rules', async () => {
        const stringifiedRule = JSON.stringify({
          from: 'now-3755555555555555.67s',
          interval: '5m',
          ...getSimpleRule('rule-1'),
        });
        const fileNdJson = Buffer.from(stringifiedRule + '\n');
        const { body } = await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', fileNdJson, 'rules.ndjson')
          .expect(200);

        expect(body.errors[0].error.message).to.eql('from: Failed to parse date-math expression');
      });

      it('should fail validation when importing two rules and one has a malformed "from" params', async () => {
        const stringifiedRule = JSON.stringify({
          from: 'now-3755555555555555.67s',
          interval: '5m',
          ...getSimpleRule('rule-1'),
        });
        const stringifiedRule2 = JSON.stringify({
          ...getSimpleRule('rule-2'),
        });
        const fileNdJson = Buffer.from([stringifiedRule, stringifiedRule2].join('\n'));
        const { body } = await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', fileNdJson, 'rules.ndjson')
          .expect(200);

        // should result in one success and a failure message
        expect(body.success_count).to.eql(1);
        expect(body.errors[0].error.message).to.eql('from: Failed to parse date-math expression');
      });

      it('should be able to import two rules', async () => {
        const { body } = await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1', 'rule-2']), 'rules.ndjson')
          .expect(200);

        expect(body).to.eql({
          errors: [],
          success: true,
          success_count: 2,
          rules_count: 2,
          exceptions_errors: [],
          exceptions_success: true,
          exceptions_success_count: 0,
          action_connectors_success: true,
          action_connectors_success_count: 0,
          action_connectors_errors: [],
          action_connectors_warnings: [],
        });
      });

      // import is very slow in 7.10+ due to the alerts client find api
      // when importing 100 rules it takes about 30 seconds for this
      // test to complete so at 10 rules completing in about 10 seconds
      // I figured this is enough to make sure the import route is doing its job.
      it('should be able to import 10 rules', async () => {
        const ruleIds = new Array(10).fill(undefined).map((_, index) => `rule-${index}`);
        const { body } = await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(ruleIds, false), 'rules.ndjson')
          .expect(200);

        expect(body).to.eql({
          errors: [],
          success: true,
          success_count: 10,
          rules_count: 10,
          exceptions_errors: [],
          exceptions_success: true,
          exceptions_success_count: 0,
          action_connectors_success: true,
          action_connectors_success_count: 0,
          action_connectors_errors: [],
          action_connectors_warnings: [],
        });
      });

      // uncomment the below test once we speed up the alerts client find api
      // in another PR.
      // it('should be able to import 10000 rules', async () => {
      //   const ruleIds = new Array(10000).fill(undefined).map((_, index) => `rule-${index}`);
      //   const { body } = await supertest
      //     .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
      //     .set('kbn-xsrf', 'true')
      //     .attach('file', getSimpleRuleAsNdjson(ruleIds, false), 'rules.ndjson')
      //     .expect(200);

      //   expect(body).to.eql({
      //     errors: [],
      //     success: true,
      //     success_count: 10000,
      //   });
      // });

      it('should NOT be able to import more than 10,000 rules', async () => {
        const ruleIds = new Array(10001).fill(undefined).map((_, index) => `rule-${index}`);
        const { body } = await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(ruleIds, false), 'rules.ndjson')
          .expect(500);

        expect(body).to.eql({
          status_code: 500,
          message: "Can't import more than 10000 rules",
        });
      });

      it('should report a conflict if there is an attempt to import two rules with the same rule_id', async () => {
        const { body } = await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1', 'rule-1']), 'rules.ndjson')
          .expect(200);

        expect(body).to.eql({
          errors: [
            {
              error: {
                message: 'More than one rule with rule-id: "rule-1" found',
                status_code: 400,
              },
              rule_id: 'rule-1',
            },
          ],
          success: false,
          success_count: 1,
          rules_count: 2,
          exceptions_errors: [],
          exceptions_success: true,
          exceptions_success_count: 0,
          action_connectors_success: true,
          action_connectors_success_count: 0,
          action_connectors_errors: [],
          action_connectors_warnings: [],
        });
      });

      it('should NOT report a conflict if there is an attempt to import two rules with the same rule_id and overwrite is set to true', async () => {
        const { body } = await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import?overwrite=true`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1', 'rule-1']), 'rules.ndjson')
          .expect(200);

        expect(body).to.eql({
          errors: [],
          success: true,
          success_count: 1,
          rules_count: 2,
          exceptions_errors: [],
          exceptions_success: true,
          exceptions_success_count: 0,
          action_connectors_success: true,
          action_connectors_success_count: 0,
          action_connectors_errors: [],
          action_connectors_warnings: [],
        });
      });

      it('should report a conflict if there is an attempt to import a rule with a rule_id that already exists', async () => {
        await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1']), 'rules.ndjson')
          .expect(200);

        const { body } = await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1']), 'rules.ndjson')
          .expect(200);

        expect(body).to.eql({
          errors: [
            {
              error: {
                message: 'rule_id: "rule-1" already exists',
                status_code: 409,
              },
              rule_id: 'rule-1',
            },
          ],
          success: false,
          rules_count: 1,
          success_count: 0,
          exceptions_errors: [],
          exceptions_success: true,
          exceptions_success_count: 0,
          action_connectors_success: true,
          action_connectors_success_count: 0,
          action_connectors_errors: [],
          action_connectors_warnings: [],
        });
      });

      it('should NOT report a conflict if there is an attempt to import a rule with a rule_id that already exists and overwrite is set to true', async () => {
        await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import?overwrite=true`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1']), 'rules.ndjson')
          .expect(200);

        const { body } = await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import?overwrite=true`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1']), 'rules.ndjson')
          .expect(200);

        expect(body).to.eql({
          errors: [],
          success: true,
          success_count: 1,
          rules_count: 1,
          exceptions_errors: [],
          exceptions_success: true,
          exceptions_success_count: 0,
          action_connectors_success: true,
          action_connectors_success_count: 0,
          action_connectors_errors: [],
          action_connectors_warnings: [],
        });
      });

      it('should overwrite an existing rule if overwrite is set to true', async () => {
        await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1']), 'rules.ndjson')
          .expect(200);

        const simpleRule = getSimpleRule('rule-1');
        simpleRule.name = 'some other name';
        const ndjson = ruleToNdjson(simpleRule);

        await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import?overwrite=true`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', ndjson, 'rules.ndjson')
          .expect(200);

        const { body } = await supertest
          .get(`${DETECTION_ENGINE_RULES_URL}?rule_id=rule-1`)
          .set('elastic-api-version', '2023-10-31')
          .send()
          .expect(200);

        const bodyToCompare = removeServerGeneratedProperties(body);
        const ruleOutput = {
          ...getSimpleRuleOutput('rule-1'),
          output_index: '',
        };
        ruleOutput.name = 'some other name';
        ruleOutput.revision = 0;
        const expectedRule = updateUsername(ruleOutput, ELASTICSEARCH_USERNAME);

        expect(bodyToCompare).to.eql(expectedRule);
      });

      it('should report a conflict if there is an attempt to import a rule with a rule_id that already exists, but still have some successes with other rules', async () => {
        await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1']), 'rules.ndjson')
          .expect(200);

        const { body } = await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1', 'rule-2', 'rule-3']), 'rules.ndjson')
          .expect(200);

        expect(body).to.eql({
          errors: [
            {
              error: {
                message: 'rule_id: "rule-1" already exists',
                status_code: 409,
              },
              rule_id: 'rule-1',
            },
          ],
          success: false,
          success_count: 2,
          rules_count: 3,
          exceptions_errors: [],
          exceptions_success: true,
          exceptions_success_count: 0,
          action_connectors_success: true,
          action_connectors_success_count: 0,
          action_connectors_errors: [],
          action_connectors_warnings: [],
        });
      });

      it('should report a mix of conflicts and a mix of successes', async () => {
        await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1', 'rule-2']), 'rules.ndjson')
          .expect(200);

        const { body } = await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1', 'rule-2', 'rule-3']), 'rules.ndjson')
          .expect(200);

        expect(body).to.eql({
          errors: [
            {
              error: {
                message: 'rule_id: "rule-1" already exists',
                status_code: 409,
              },
              rule_id: 'rule-1',
            },
            {
              error: {
                message: 'rule_id: "rule-2" already exists',
                status_code: 409,
              },
              rule_id: 'rule-2',
            },
          ],
          success: false,
          success_count: 1,
          rules_count: 3,
          exceptions_errors: [],
          exceptions_success: true,
          exceptions_success_count: 0,
          action_connectors_success: true,
          action_connectors_success_count: 0,
          action_connectors_errors: [],
          action_connectors_warnings: [],
        });
      });

      it('should be able to correctly read back a mixed import of different rules even if some cause conflicts', async () => {
        const getRuleOutput = (name: string) => ({
          ...getSimpleRuleOutput(name),
          output_index: '',
        });
        await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1', 'rule-2']), 'rules.ndjson')
          .expect(200);

        await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/_import`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', getSimpleRuleAsNdjson(['rule-1', 'rule-2', 'rule-3']), 'rules.ndjson')
          .expect(200);

        const { body: bodyOfRule1 } = await supertest
          .get(`${DETECTION_ENGINE_RULES_URL}?rule_id=rule-1`)
          .set('elastic-api-version', '2023-10-31')
          .send()
          .expect(200);

        const { body: bodyOfRule2 } = await supertest
          .get(`${DETECTION_ENGINE_RULES_URL}?rule_id=rule-2`)
          .set('elastic-api-version', '2023-10-31')
          .send()
          .expect(200);

        const { body: bodyOfRule3 } = await supertest
          .get(`${DETECTION_ENGINE_RULES_URL}?rule_id=rule-3`)
          .set('elastic-api-version', '2023-10-31')
          .send()
          .expect(200);

        const bodyToCompareOfRule1 = removeServerGeneratedProperties(bodyOfRule1);
        const bodyToCompareOfRule2 = removeServerGeneratedProperties(bodyOfRule2);
        const bodyToCompareOfRule3 = removeServerGeneratedProperties(bodyOfRule3);
        const expectedRule = updateUsername(getRuleOutput('rule-1'), ELASTICSEARCH_USERNAME);
        const expectedRule2 = updateUsername(getRuleOutput('rule-2'), ELASTICSEARCH_USERNAME);
        const expectedRule3 = updateUsername(getRuleOutput('rule-3'), ELASTICSEARCH_USERNAME);

        expect([bodyToCompareOfRule1, bodyToCompareOfRule2, bodyToCompareOfRule3]).to.eql([
          expectedRule,
          expectedRule2,
          expectedRule3,
        ]);
      });
    });
  });
};
