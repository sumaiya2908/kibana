/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { apiCanLinkToLibrary, CanLinkToLibrary } from '@kbn/presentation-library';
import {
  apiCanAccessViewMode,
  EmbeddableApiContext,
  PublishesPanelTitle,
  CanAccessViewMode,
  getInheritedViewMode,
} from '@kbn/presentation-publishing';
import { Action, IncompatibleActionError } from '@kbn/ui-actions-plugin/public';
import { pluginServices } from '../services/plugin_services';
import { dashboardAddToLibraryActionStrings } from './_dashboard_actions_strings';

export const ACTION_ADD_TO_LIBRARY = 'saveToLibrary';

export type AddPanelToLibraryActionApi = CanAccessViewMode &
  CanLinkToLibrary &
  Partial<PublishesPanelTitle>;

const isApiCompatible = (api: unknown | null): api is AddPanelToLibraryActionApi =>
  Boolean(apiCanAccessViewMode(api) && apiCanLinkToLibrary(api));

export class AddToLibraryAction implements Action<EmbeddableApiContext> {
  public readonly type = ACTION_ADD_TO_LIBRARY;
  public readonly id = ACTION_ADD_TO_LIBRARY;
  public order = 15;

  private toastsService;

  constructor() {
    ({
      notifications: { toasts: this.toastsService },
    } = pluginServices.getServices());
  }

  public getDisplayName({ embeddable }: EmbeddableApiContext) {
    if (!isApiCompatible(embeddable)) throw new IncompatibleActionError();
    return dashboardAddToLibraryActionStrings.getDisplayName();
  }

  public getIconType({ embeddable }: EmbeddableApiContext) {
    if (!isApiCompatible(embeddable)) throw new IncompatibleActionError();
    return 'folderCheck';
  }

  public async isCompatible({ embeddable }: EmbeddableApiContext) {
    if (!isApiCompatible(embeddable)) return false;
    return getInheritedViewMode(embeddable) === 'edit' && (await embeddable.canLinkToLibrary());
  }

  public async execute({ embeddable }: EmbeddableApiContext) {
    if (!isApiCompatible(embeddable)) throw new IncompatibleActionError();
    const panelTitle = embeddable.panelTitle?.value ?? embeddable.defaultPanelTitle?.value;
    try {
      await embeddable.linkToLibrary();
      this.toastsService.addSuccess({
        title: dashboardAddToLibraryActionStrings.getSuccessMessage(
          panelTitle ? `'${panelTitle}'` : ''
        ),
        'data-test-subj': 'addPanelToLibrarySuccess',
      });
    } catch (e) {
      this.toastsService.addDanger({
        title: dashboardAddToLibraryActionStrings.getErrorMessage(panelTitle),
        'data-test-subj': 'addPanelToLibraryError',
      });
    }
  }
}
