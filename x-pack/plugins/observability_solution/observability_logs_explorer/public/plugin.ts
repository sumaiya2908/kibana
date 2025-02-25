/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AppMountParameters,
  CoreSetup,
  CoreStart,
  DEFAULT_APP_CATEGORIES,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/public';
import { OBSERVABILITY_LOGS_EXPLORER_APP_ID } from '@kbn/deeplinks-observability';
import {
  AllDatasetsLocatorDefinition,
  ObservabilityLogsExplorerLocators,
  SingleDatasetLocatorDefinition,
} from '../common/locators';
import { type ObservabilityLogsExplorerConfig } from '../common/plugin_config';
import { logsExplorerAppTitle } from '../common/translations';
import type {
  ObservabilityLogsExplorerAppMountParameters,
  ObservabilityLogsExplorerPluginSetup,
  ObservabilityLogsExplorerPluginStart,
  ObservabilityLogsExplorerSetupDeps,
  ObservabilityLogsExplorerStartDeps,
} from './types';
export class ObservabilityLogsExplorerPlugin
  implements Plugin<ObservabilityLogsExplorerPluginSetup, ObservabilityLogsExplorerPluginStart>
{
  private config: ObservabilityLogsExplorerConfig;
  private locators?: ObservabilityLogsExplorerLocators;

  constructor(context: PluginInitializerContext<ObservabilityLogsExplorerConfig>) {
    this.config = context.config.get();
  }

  public setup(
    core: CoreSetup<ObservabilityLogsExplorerStartDeps, ObservabilityLogsExplorerPluginStart>,
    _pluginsSetup: ObservabilityLogsExplorerSetupDeps
  ) {
    const { share, serverless, discover } = _pluginsSetup;
    const useHash = core.uiSettings.get('state:storeInSessionStorage');

    core.application.register({
      id: OBSERVABILITY_LOGS_EXPLORER_APP_ID,
      title: logsExplorerAppTitle,
      category: DEFAULT_APP_CATEGORIES.observability,
      euiIconType: 'logoLogging',
      visibleIn: this.config.navigation.showAppLink
        ? ['globalSearch', 'sideNav']
        : ['globalSearch'],
      keywords: ['logs', 'log', 'explorer', 'logs explorer'],
      mount: async (appMountParams: ObservabilityLogsExplorerAppMountParameters) => {
        const [coreStart, pluginsStart, ownPluginStart] = await core.getStartServices();
        const { renderObservabilityLogsExplorer } = await import(
          './applications/observability_logs_explorer'
        );

        return renderObservabilityLogsExplorer(
          coreStart,
          pluginsStart,
          ownPluginStart,
          appMountParams
        );
      },
    });

    // App used solely to redirect from "/app/observability-log-explorer" to "/app/observability-logs-explorer"
    core.application.register({
      id: 'observability-log-explorer',
      title: logsExplorerAppTitle,
      visibleIn: [],
      mount: async (appMountParams: AppMountParameters) => {
        const [coreStart] = await core.getStartServices();
        const { renderObservabilityLogsExplorerRedirect } = await import(
          './applications/redirect_to_observability_logs_explorer'
        );

        return renderObservabilityLogsExplorerRedirect(coreStart, appMountParams);
      },
    });

    if (serverless) {
      discover.showLogsExplorerTabs();
    }

    // Register Locators
    const singleDatasetLocator = share.url.locators.create(
      new SingleDatasetLocatorDefinition({
        useHash,
      })
    );
    const allDatasetsLocator = share.url.locators.create(
      new AllDatasetsLocatorDefinition({
        useHash,
      })
    );

    this.locators = {
      singleDatasetLocator,
      allDatasetsLocator,
    };

    return {
      locators: this.locators,
    };
  }

  public start(_core: CoreStart, _pluginsStart: ObservabilityLogsExplorerStartDeps) {
    return {};
  }
}
