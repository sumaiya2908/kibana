/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as Rx from 'rxjs';
import { catchError, filter, map, mergeMap, takeUntil } from 'rxjs/operators';

import {
  CoreSetup,
  CoreStart,
  HttpSetup,
  IUiSettingsClient,
  NotificationsSetup,
  Plugin,
  PluginInitializerContext,
  ThemeServiceStart,
} from '@kbn/core/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import { CONTEXT_MENU_TRIGGER } from '@kbn/embeddable-plugin/public';
import type { HomePublicPluginSetup, HomePublicPluginStart } from '@kbn/home-plugin/public';
import { i18n } from '@kbn/i18n';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';
import type { ManagementSetup, ManagementStart } from '@kbn/management-plugin/public';
import type { ScreenshotModePluginSetup } from '@kbn/screenshot-mode-plugin/public';

import { JOB_COMPLETION_NOTIFICATIONS_SESSION_KEY, durationToNumber } from '@kbn/reporting-common';
import type { JobId } from '@kbn/reporting-common/types';
import type { ClientConfigType } from '@kbn/reporting-public';
import type { SharePluginSetup, SharePluginStart } from '@kbn/share-plugin/public';
import type { UiActionsSetup, UiActionsStart } from '@kbn/ui-actions-plugin/public';

import type { ReportingSetup, ReportingStart } from '.';
import { ReportingAPIClient } from './lib/reporting_api_client';
import { ReportingNotifierStreamHandler as StreamHandler } from './lib/stream_handler';
import { getGeneralErrorToast } from './notifier';
import { ReportingCsvPanelAction } from './panel_actions/get_csv_panel_action';
import { reportingCsvShareProvider } from './share_context_menu/register_csv_reporting';
import { reportingScreenshotShareProvider } from './share_context_menu/register_pdf_png_reporting';
import { getSharedComponents } from './shared';
import type { JobSummarySet } from './types';

function getStored(): JobId[] {
  const sessionValue = sessionStorage.getItem(JOB_COMPLETION_NOTIFICATIONS_SESSION_KEY);
  return sessionValue ? JSON.parse(sessionValue) : [];
}

function handleError(
  notifications: NotificationsSetup,
  err: Error,
  theme: ThemeServiceStart
): Rx.Observable<JobSummarySet> {
  notifications.toasts.addDanger(
    getGeneralErrorToast(
      i18n.translate('xpack.reporting.publicNotifier.pollingErrorMessage', {
        defaultMessage: 'Reporting notifier error!',
      }),
      err,
      theme
    )
  );
  window.console.error(err);
  return Rx.of({ completed: [], failed: [] });
}

export interface ReportingPublicPluginSetupDependencies {
  home: HomePublicPluginSetup;
  management: ManagementSetup;
  uiActions: UiActionsSetup;
  screenshotMode: ScreenshotModePluginSetup;
  share: SharePluginSetup;
}

export interface ReportingPublicPluginStartDependencies {
  home: HomePublicPluginStart;
  data: DataPublicPluginStart;
  management: ManagementStart;
  licensing: LicensingPluginStart;
  uiActions: UiActionsStart;
  share: SharePluginStart;
}

/**
 * @internal
 * @implements Plugin
 */
export class ReportingPublicPlugin
  implements
    Plugin<
      ReportingSetup,
      ReportingStart,
      ReportingPublicPluginSetupDependencies,
      ReportingPublicPluginStartDependencies
    >
{
  private kibanaVersion: string;
  private apiClient?: ReportingAPIClient;
  private readonly stop$ = new Rx.ReplaySubject<void>(1);
  private readonly title = i18n.translate('xpack.reporting.management.reportingTitle', {
    defaultMessage: 'Reporting',
  });
  private readonly breadcrumbText = i18n.translate('xpack.reporting.breadcrumb', {
    defaultMessage: 'Reporting',
  });
  private config: ClientConfigType;
  private contract?: ReportingSetup;

  constructor(initializerContext: PluginInitializerContext) {
    this.config = initializerContext.config.get<ClientConfigType>();
    this.kibanaVersion = initializerContext.env.packageInfo.version;
  }

  /*
   * Use a single instance of ReportingAPIClient for all the reporting code
   */
  private getApiClient(http: HttpSetup, uiSettings: IUiSettingsClient) {
    if (!this.apiClient) {
      this.apiClient = new ReportingAPIClient(http, uiSettings, this.kibanaVersion);
    }
    return this.apiClient;
  }

  private getContract(core?: CoreSetup) {
    if (core) {
      this.contract = {
        usesUiCapabilities: () => this.config.roles?.enabled === false,
        components: getSharedComponents(core, this.getApiClient(core.http, core.uiSettings)),
      };
    }

    if (!this.contract) {
      throw new Error(`Setup error in Reporting plugin!`);
    }

    return this.contract;
  }

  public setup(
    core: CoreSetup<ReportingPublicPluginStartDependencies>,
    setupDeps: ReportingPublicPluginSetupDependencies
  ) {
    const { getStartServices, uiSettings } = core;
    const {
      home: homeSetup,
      management: managementSetup,
      screenshotMode: screenshotModeSetup,
      share: shareSetup,
      uiActions: uiActionsSetup,
    } = setupDeps;

    const startServices$ = Rx.from(getStartServices());
    const usesUiCapabilities = !this.config.roles.enabled;

    const apiClient = this.getApiClient(core.http, core.uiSettings);

    homeSetup.featureCatalogue.register({
      id: 'reporting',
      title: i18n.translate('xpack.reporting.registerFeature.reportingTitle', {
        defaultMessage: 'Reporting',
      }),
      description: i18n.translate('xpack.reporting.registerFeature.reportingDescription', {
        defaultMessage: 'Manage your reports generated from Discover, Visualize, and Dashboard.',
      }),
      icon: 'reportingApp',
      path: '/app/management/insightsAndAlerting/reporting',
      showOnHomePage: false,
      category: 'admin',
    });

    managementSetup.sections.section.insightsAndAlerting.registerApp({
      id: 'reporting',
      title: this.title,
      order: 3,
      mount: async (params) => {
        params.setBreadcrumbs([{ text: this.breadcrumbText }]);
        const [[coreStart, startDeps], { mountManagementSection }] = await Promise.all([
          getStartServices(),
          import('./management/mount_management_section'),
        ]);

        const { licensing, data, share } = startDeps;
        const { docTitle } = coreStart.chrome;
        docTitle.change(this.title);

        const umountAppCallback = await mountManagementSection(
          coreStart,
          licensing.license$,
          data,
          share,
          this.config,
          apiClient,
          params
        );

        return () => {
          docTitle.reset();
          umountAppCallback();
        };
      },
    });

    core.application.register({
      id: 'reportingRedirect',
      mount: async (params) => {
        const { mountRedirectApp } = await import('./redirect');
        return mountRedirectApp({
          ...params,
          apiClient,
          screenshotMode: screenshotModeSetup,
          share: shareSetup,
        });
      },
      title: 'Reporting redirect app',
      chromeless: true,
      exactRoute: true,
      visibleIn: [],
    });

    uiActionsSetup.addTriggerAction(
      CONTEXT_MENU_TRIGGER,
      new ReportingCsvPanelAction({ core, apiClient, startServices$, usesUiCapabilities })
    );

    const reportingStart = this.getContract(core);
    const { toasts } = core.notifications;

    startServices$.subscribe(([{ application }, { licensing }]) => {
      licensing.license$.subscribe((license) => {
        shareSetup.register(
          reportingCsvShareProvider({
            apiClient,
            toasts,
            uiSettings,
            license,
            application,
            usesUiCapabilities,
            theme: core.theme,
          })
        );

        if (this.config.export_types.pdf.enabled || this.config.export_types.png.enabled) {
          shareSetup.register(
            reportingScreenshotShareProvider({
              apiClient,
              toasts,
              uiSettings,
              license,
              application,
              usesUiCapabilities,
              theme: core.theme,
            })
          );
        }
      });
    });

    return reportingStart;
  }

  public start(core: CoreStart) {
    const { notifications, docLinks } = core;
    const apiClient = this.getApiClient(core.http, core.uiSettings);
    const streamHandler = new StreamHandler(notifications, apiClient, core.theme, docLinks);
    const interval = durationToNumber(this.config.poll.jobsRefresh.interval);
    Rx.timer(0, interval)
      .pipe(
        takeUntil(this.stop$), // stop the interval when stop method is called
        map(() => getStored()), // read all pending job IDs from session storage
        filter((storedJobs) => storedJobs.length > 0), // stop the pipeline here if there are none pending
        mergeMap((storedJobs) => streamHandler.findChangedStatusJobs(storedJobs)), // look up the latest status of all pending jobs on the server
        mergeMap(({ completed, failed }) => streamHandler.showNotifications({ completed, failed })),
        catchError((err) => handleError(notifications, err, core.theme))
      )
      .subscribe();

    return this.getContract();
  }

  public stop() {
    this.stop$.next();
  }
}

export type Setup = ReturnType<ReportingPublicPlugin['setup']>;
export type Start = ReturnType<ReportingPublicPlugin['start']>;
