/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { AggregateQuery, Query, TimeRange } from '@kbn/es-query';
import { type DataView, DataViewType } from '@kbn/data-views-plugin/public';
import type { DataViewPickerProps } from '@kbn/unified-search-plugin/public';
import { ENABLE_ESQL } from '@kbn/discover-utils';
import { useSavedSearchInitial } from '../../services/discover_state_provider';
import { useInternalStateSelector } from '../../services/discover_internal_state_container';
import { useDiscoverServices } from '../../../../hooks/use_discover_services';
import { getHeaderActionMenuMounter } from '../../../../kibana_services';
import { DiscoverStateContainer } from '../../services/discover_state';
import { onSaveSearch } from './on_save_search';
import { useDiscoverCustomization } from '../../../../customizations';
import { addLog } from '../../../../utils/add_log';
import { useAppStateSelector } from '../../services/discover_app_state_container';
import { isTextBasedQuery } from '../../utils/is_text_based_query';
import { useDiscoverTopNav } from './use_discover_topnav';

export interface DiscoverTopNavProps {
  savedQuery?: string;
  updateQuery: (
    payload: { dateRange: TimeRange; query?: Query | AggregateQuery },
    isUpdate?: boolean
  ) => void;
  stateContainer: DiscoverStateContainer;
  textBasedLanguageModeErrors?: Error;
  textBasedLanguageModeWarning?: string;
  onFieldEdited: () => Promise<void>;
  isLoading?: boolean;
  onCancelClick?: () => void;
}

export const DiscoverTopNav = ({
  savedQuery,
  stateContainer,
  updateQuery,
  textBasedLanguageModeErrors,
  textBasedLanguageModeWarning,
  onFieldEdited,
  isLoading,
  onCancelClick,
}: DiscoverTopNavProps) => {
  const query = useAppStateSelector((state) => state.query);
  const adHocDataViews = useInternalStateSelector((state) => state.adHocDataViews);
  const dataView = useInternalStateSelector((state) => state.dataView!);
  const savedDataViews = useInternalStateSelector((state) => state.savedDataViews);
  const savedSearch = useSavedSearchInitial();
  const isTextBased = useMemo(() => isTextBasedQuery(query), [query]);
  const showDatePicker = useMemo(() => {
    // always show the timepicker for text based languages
    return (
      isTextBased ||
      (!isTextBased && dataView.isTimeBased() && dataView.type !== DataViewType.ROLLUP)
    );
  }, [dataView, isTextBased]);
  const services = useDiscoverServices();
  const { dataViewEditor, navigation, dataViewFieldEditor, data, uiSettings, dataViews } = services;

  const canEditDataView =
    Boolean(dataViewEditor?.userPermissions.editDataView()) || !dataView.isPersisted();

  const closeFieldEditor = useRef<() => void | undefined>();
  const closeDataViewEditor = useRef<() => void | undefined>();

  const { AggregateQueryTopNavMenu } = navigation.ui;

  useEffect(() => {
    return () => {
      // Make sure to close the editors when unmounting
      if (closeFieldEditor.current) {
        closeFieldEditor.current();
      }
      if (closeDataViewEditor.current) {
        closeDataViewEditor.current();
      }
    };
  }, []);

  const editField = useMemo(
    () =>
      canEditDataView
        ? async (fieldName?: string, uiAction: 'edit' | 'add' = 'edit') => {
            if (dataView?.id) {
              const dataViewInstance = await data.dataViews.get(dataView.id);
              closeFieldEditor.current = dataViewFieldEditor.openEditor({
                ctx: {
                  dataView: dataViewInstance,
                },
                fieldName,
                onSave: async () => {
                  await onFieldEdited();
                },
              });
            }
          }
        : undefined,
    [canEditDataView, dataView?.id, data.dataViews, dataViewFieldEditor, onFieldEdited]
  );

  const addField = useMemo(
    () => (canEditDataView && editField ? () => editField(undefined, 'add') : undefined),
    [editField, canEditDataView]
  );

  const createNewDataView = useCallback(() => {
    closeDataViewEditor.current = dataViewEditor.openEditor({
      onSave: stateContainer.actions.onDataViewCreated,
      allowAdHocDataView: true,
    });
  }, [dataViewEditor, stateContainer]);

  const onEditDataView = async (editedDataView: DataView) => {
    if (editedDataView.isPersisted()) {
      // Clear the current data view from the cache and create a new instance
      // of it, ensuring we have a new object reference to trigger a re-render
      dataViews.clearInstanceCache(editedDataView.id);
      stateContainer.actions.setDataView(await dataViews.create(editedDataView.toSpec(), true));
    } else {
      await stateContainer.actions.updateAdHocDataViewId();
    }
    stateContainer.actions.loadDataViewList();
    addLog('[DiscoverTopNav] onEditDataView triggers data fetching');
    stateContainer.dataState.fetch();
  };

  const updateSavedQueryId = (newSavedQueryId: string | undefined) => {
    const { appState } = stateContainer;
    if (newSavedQueryId) {
      appState.update({ savedQuery: newSavedQueryId });
    } else {
      // remove savedQueryId from state
      const newState = {
        ...appState.getState(),
      };
      delete newState.savedQuery;
      appState.set(newState);
    }
  };
  const setMenuMountPoint = useMemo(() => {
    return getHeaderActionMenuMounter();
  }, []);
  const isESQLModeEnabled = uiSettings.get(ENABLE_ESQL);
  const supportedTextBasedLanguages = [];
  if (isESQLModeEnabled) {
    supportedTextBasedLanguages.push('ESQL');
  }

  const searchBarCustomization = useDiscoverCustomization('search_bar');

  const SearchBar = useMemo(
    () => searchBarCustomization?.CustomSearchBar ?? AggregateQueryTopNavMenu,
    [searchBarCustomization?.CustomSearchBar, AggregateQueryTopNavMenu]
  );

  const shouldHideDefaultDataviewPicker =
    !!searchBarCustomization?.CustomDataViewPicker || !!searchBarCustomization?.hideDataViewPicker;

  const dataViewPickerProps: DataViewPickerProps = {
    trigger: {
      label: dataView?.getName() || '',
      'data-test-subj': 'discover-dataView-switch-link',
      title: dataView?.getIndexPattern() || '',
    },
    currentDataViewId: dataView?.id,
    onAddField: addField,
    onDataViewCreated: createNewDataView,
    onCreateDefaultAdHocDataView: stateContainer.actions.createAndAppendAdHocDataView,
    onChangeDataView: stateContainer.actions.onChangeDataView,
    textBasedLanguages: supportedTextBasedLanguages as DataViewPickerProps['textBasedLanguages'],
    adHocDataViews,
    savedDataViews,
    onEditDataView,
  };

  const onTextBasedSavedAndExit = useCallback(
    ({ onSave, onCancel }) => {
      onSaveSearch({
        savedSearch: stateContainer.savedSearchState.getState(),
        services,
        state: stateContainer,
        onClose: onCancel,
        onSaveCb: onSave,
      });
    },
    [services, stateContainer]
  );

  const { topNavBadges, topNavMenu } = useDiscoverTopNav({ stateContainer });
  const topNavProps = !services.serverless && {
    badges: topNavBadges,
    config: topNavMenu,
    setMenuMountPoint,
  };

  return (
    <SearchBar
      {...topNavProps}
      appName="discover"
      indexPatterns={[dataView]}
      onQuerySubmit={updateQuery}
      onCancel={onCancelClick}
      isLoading={isLoading}
      onSavedQueryIdChange={updateSavedQueryId}
      query={query}
      savedQueryId={savedQuery}
      screenTitle={savedSearch.title}
      showDatePicker={showDatePicker}
      saveQueryMenuVisibility={
        services.capabilities.discover.saveQuery ? 'allowed_by_app_privilege' : 'globally_managed'
      }
      showSearchBar={true}
      useDefaultBehaviors={true}
      dataViewPickerOverride={
        searchBarCustomization?.CustomDataViewPicker ? (
          <searchBarCustomization.CustomDataViewPicker />
        ) : undefined
      }
      dataViewPickerComponentProps={
        shouldHideDefaultDataviewPicker ? undefined : dataViewPickerProps
      }
      displayStyle="detached"
      textBasedLanguageModeErrors={
        textBasedLanguageModeErrors ? [textBasedLanguageModeErrors] : undefined
      }
      textBasedLanguageModeWarning={textBasedLanguageModeWarning}
      onTextBasedSavedAndExit={onTextBasedSavedAndExit}
      prependFilterBar={
        searchBarCustomization?.PrependFilterBar ? (
          <searchBarCustomization.PrependFilterBar />
        ) : undefined
      }
    />
  );
};
