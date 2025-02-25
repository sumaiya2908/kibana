/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import { keyBy, mapValues, once, pick } from 'lodash';
import pLimit from 'p-limit';
import Path from 'path';
import { lastValueFrom, startWith, type Observable } from 'rxjs';
import { promisify } from 'util';
import type { FunctionRegistrationParameters } from '..';
import type { ChatCompletionChunkEvent } from '../../../common/conversation_complete';
import {
  VisualizeESQLUserIntention,
  VISUALIZE_ESQL_USER_INTENTIONS,
} from '../../../common/functions/visualize_esql';
import { FunctionVisibility, MessageRole } from '../../../common/types';
import { concatenateChatCompletionChunks } from '../../../common/utils/concatenate_chat_completion_chunks';
import { emitWithConcatenatedMessage } from '../../../common/utils/emit_with_concatenated_message';
import { createFunctionResponseMessage } from '../../service/util/create_function_response_message';
import { correctCommonEsqlMistakes } from './correct_common_esql_mistakes';

const readFile = promisify(Fs.readFile);
const readdir = promisify(Fs.readdir);

const loadSystemMessage = once(async () => {
  const data = await readFile(Path.join(__dirname, './system_message.txt'));
  return data.toString('utf-8');
});

const loadEsqlDocs = once(async () => {
  const dir = Path.join(__dirname, './esql_docs');
  const files = (await readdir(dir)).filter((file) => Path.extname(file) === '.txt');

  if (!files.length) {
    return {};
  }

  const limiter = pLimit(10);
  return keyBy(
    await Promise.all(
      files.map((file) =>
        limiter(async () => {
          const data = (await readFile(Path.join(dir, file))).toString('utf-8');
          const filename = Path.basename(file, '.txt');

          const keyword = filename
            .replace('esql-', '')
            .replace('agg-', '')
            .replaceAll('-', '_')
            .toUpperCase();

          return {
            keyword: keyword === 'STATS_BY' ? 'STATS' : keyword,
            data,
          };
        })
      )
    ),
    'keyword'
  );
});

export function registerQueryFunction({
  client,
  registerFunction,
  resources,
}: FunctionRegistrationParameters) {
  registerFunction(
    {
      name: 'execute_query',
      contexts: ['core'],
      visibility: FunctionVisibility.AssistantOnly,
      description: 'Display the results of an ES|QL query.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: {
            type: 'string',
          },
        },
        required: ['query'],
      } as const,
    },
    async ({ arguments: { query } }) => {
      const response = await (
        await resources.context.core
      ).elasticsearch.client.asCurrentUser.transport.request({
        method: 'POST',
        path: '_query',
        body: {
          query,
        },
      });

      return { content: response };
    }
  );
  registerFunction(
    {
      name: 'query',
      contexts: ['core'],
      description: `This function generates, executes and/or visualizes a query based on the user's request.`,
      visibility: FunctionVisibility.AssistantOnly,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          switch: {
            type: 'boolean',
          },
        },
        required: ['switch'],
      } as const,
    },
    async ({ messages, connectorId }, signal) => {
      const [systemMessage, esqlDocs] = await Promise.all([loadSystemMessage(), loadEsqlDocs()]);

      const withEsqlSystemMessage = (message?: string) => [
        {
          '@timestamp': new Date().toISOString(),
          message: { role: MessageRole.System, content: `${systemMessage}\n${message ?? ''}` },
        },
        ...messages.slice(1),
      ];

      const source$ = (
        await client.chat('classify_esql', {
          connectorId,
          messages: withEsqlSystemMessage().concat({
            '@timestamp': new Date().toISOString(),
            message: {
              role: MessageRole.User,
              content: `Use the classify_esql function to classify the user's request
              in the user message before this.
              and get more information about specific functions and commands
              you think are candidates for answering the question.
              
              Examples for functions and commands:
              Do you need to group data? Request \`STATS\`.
              Extract data? Request \`DISSECT\` AND \`GROK\`.
              Convert a column based on a set of conditionals? Request \`EVAL\` and \`CASE\`.

              For determining the intention of the user, the following options are available:

              ${VisualizeESQLUserIntention.generateQueryOnly}: the user only wants to generate the query,
              but not run it.

              ${VisualizeESQLUserIntention.executeAndReturnResults}: the user wants to execute the query,
              and have the assistant return/analyze/summarize the results. they don't need a
              visualization.

              ${VisualizeESQLUserIntention.visualizeAuto}: The user wants to visualize the data from the
              query, but wants us to pick the best visualization type, or their preferred
              visualization is unclear.

              These intentions will display a specific visualization:
              ${VisualizeESQLUserIntention.visualizeBar}
              ${VisualizeESQLUserIntention.visualizeDonut}
              ${VisualizeESQLUserIntention.visualizeHeatmap}
              ${VisualizeESQLUserIntention.visualizeLine}
              ${VisualizeESQLUserIntention.visualizeTagcloud}
              ${VisualizeESQLUserIntention.visualizeTreemap}
              ${VisualizeESQLUserIntention.visualizeWaffle}
              ${VisualizeESQLUserIntention.visualizeXy}

              Some examples:
              "Show me the avg of x" => ${VisualizeESQLUserIntention.executeAndReturnResults}
              "Show me the results of y" => ${VisualizeESQLUserIntention.executeAndReturnResults}
              "Display the sum of z" => ${VisualizeESQLUserIntention.executeAndReturnResults}

              "I want a query that ..." => ${VisualizeESQLUserIntention.generateQueryOnly}
              "... Just show me the query" => ${VisualizeESQLUserIntention.generateQueryOnly}
              "Create a query that ..." => ${VisualizeESQLUserIntention.generateQueryOnly}

              "Show me the avg of x over time" => ${VisualizeESQLUserIntention.visualizeAuto}
              "I want a bar chart of ... " => ${VisualizeESQLUserIntention.visualizeBar}
              "I want to see a heat map of ..." => ${VisualizeESQLUserIntention.visualizeHeatmap}
              `,
            },
          }),
          signal,
          functions: [
            {
              name: 'classify_esql',
              description: `Use this function to determine:
              - what ES|QL functions and commands are candidates for answering the user's question
              - whether the user has requested a query, and if so, it they want it to be executed, or just shown.

              All parameters are required. Make sure the functions and commands you request are available in the
              system message.
              `,
              parameters: {
                type: 'object',
                properties: {
                  commands: {
                    type: 'array',
                    items: {
                      type: 'string',
                    },
                    description: 'A list of processing or source commands',
                  },
                  functions: {
                    type: 'array',
                    items: {
                      type: 'string',
                    },
                    description: 'A list of functions.',
                  },
                  intention: {
                    type: 'string',
                    description: `What the user\'s intention is.`,
                    enum: VISUALIZE_ESQL_USER_INTENTIONS,
                  },
                },
                required: ['commands', 'functions', 'intention'],
              },
            },
          ],
          functionCall: 'classify_esql',
        })
      ).pipe(concatenateChatCompletionChunks());

      const response = await lastValueFrom(source$);

      if (!response.message.function_call.arguments) {
        throw new Error('LLM did not call classify_esql function');
      }

      const args = JSON.parse(response.message.function_call.arguments) as {
        commands: string[];
        functions: string[];
        intention: VisualizeESQLUserIntention;
      };

      const keywords = args.commands.concat(args.functions).concat('SYNTAX').concat('OVERVIEW');

      const messagesToInclude = mapValues(pick(esqlDocs, keywords), ({ data }) => data);

      let userIntentionMessage: string;

      switch (args.intention) {
        case VisualizeESQLUserIntention.executeAndReturnResults:
          userIntentionMessage = `When you generate a query, it will automatically be executed and its results returned to you. The user does not need to do anything for this.`;
          break;

        case VisualizeESQLUserIntention.generateQueryOnly:
          userIntentionMessage = `Any generated query will not be executed automatically, the user needs to do this themselves.`;
          break;

        default:
          userIntentionMessage = `The generated query will automatically be visualized to the user, displayed below your message. The user does not need to do anything for this.`;
          break;
      }

      const esqlResponse$: Observable<ChatCompletionChunkEvent> = await client.chat(
        'answer_esql_question',
        {
          messages: [
            ...withEsqlSystemMessage(
              `Format every ES|QL query as Markdown:
              \`\`\`esql
              <query>
              \`\`\`

              Prefer to use commands and functions for which you have requested documentation.

              ${userIntentionMessage}

              DO NOT UNDER ANY CIRCUMSTANCES use commands or functions that are not a capability of ES|QL
              as mentioned in the system message and documentation.
              
              Directive: ONLY use aggregation functions in STATS commands, and use ONLY aggregation
              functions in stats commands, NOT in SORT or EVAL.
              Rationale: Only aggregation functions are supported in STATS commands, and aggregation
              functions are only supported in STATS commands. 
              Action: Create new columns using EVAL first and then aggregate over them in STATS commands.
              Do not use aggregation functions anywhere else, such as SORT or EVAL.
              Example:
              \`\`\`esql
              EVAL is_failure_as_number = CASE(event.outcome == "failure", 1, 0)
              | STATS total_failures = SUM(is_failure_as_number) BY my_grouping_name
              \`\`\`
              
              `
            ),
            {
              '@timestamp': new Date().toISOString(),
              message: {
                role: MessageRole.Assistant,
                content: '',
                function_call: {
                  name: 'get_esql_info',
                  arguments: JSON.stringify(args),
                  trigger: MessageRole.Assistant as const,
                },
              },
            },
            {
              '@timestamp': new Date().toISOString(),
              message: {
                role: MessageRole.User,
                name: 'get_esql_info',
                content: JSON.stringify({
                  documentation: messagesToInclude,
                }),
              },
            },
          ],
          connectorId,
          signal,
        }
      );

      return esqlResponse$.pipe(
        emitWithConcatenatedMessage((msg) => {
          const esqlQuery = correctCommonEsqlMistakes(msg.message.content, resources.logger).match(
            /```esql([\s\S]*?)```/
          )?.[1];

          return {
            ...msg,
            message: {
              ...msg.message,
              content: correctCommonEsqlMistakes(msg.message.content, resources.logger),
              ...(esqlQuery &&
              args.intention &&
              args.intention !== VisualizeESQLUserIntention.generateQueryOnly
                ? {
                    function_call: {
                      name: 'visualize_query',
                      arguments: JSON.stringify({ query: esqlQuery, intention: args.intention }),
                      trigger: MessageRole.Assistant as const,
                    },
                  }
                : {}),
            },
          };
        }),
        startWith(createFunctionResponseMessage({ name: 'query', content: { switch: true } }))
      );
    }
  );
}
