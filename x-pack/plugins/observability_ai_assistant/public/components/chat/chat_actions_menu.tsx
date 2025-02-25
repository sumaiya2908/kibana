/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { i18n } from '@kbn/i18n';
import { EuiButtonIcon, EuiContextMenu, EuiPanel, EuiPopover, EuiToolTip } from '@elastic/eui';
import { useKibana } from '../../hooks/use_kibana';
import { useObservabilityAIAssistantRouter } from '../../hooks/use_observability_ai_assistant_router';
import { getSettingsHref } from '../../utils/get_settings_href';
import { getSettingsKnowledgeBaseHref } from '../../utils/get_settings_kb_href';
import { ConnectorSelectorBase } from '../connector_selector/connector_selector_base';
import type { UseGenAIConnectorsResult } from '../../hooks/use_genai_connectors';

export function ChatActionsMenu({
  connectors,
  conversationId,
  disabled,
  showLinkToConversationsApp,
  onCopyConversationClick,
}: {
  connectors: UseGenAIConnectorsResult;
  conversationId?: string;
  disabled: boolean;
  showLinkToConversationsApp: boolean;
  onCopyConversationClick: () => void;
}) {
  const {
    application: { navigateToUrl },
    http,
  } = useKibana().services;
  const [isOpen, setIsOpen] = useState(false);

  const router = useObservabilityAIAssistantRouter();

  const toggleActionsMenu = () => {
    setIsOpen(!isOpen);
  };

  const handleNavigateToSettings = () => {
    navigateToUrl(getSettingsHref(http));
  };

  const handleNavigateToSettingsKnowledgeBase = () => {
    navigateToUrl(getSettingsKnowledgeBaseHref(http));
  };

  return (
    <EuiPopover
      isOpen={isOpen}
      button={
        <EuiToolTip
          content={i18n.translate(
            'xpack.observabilityAiAssistant.chatActionsMenu.euiToolTip.moreActionsLabel',
            { defaultMessage: 'More actions' }
          )}
          display="block"
        >
          <EuiButtonIcon
            data-test-subj="observabilityAiAssistantChatActionsMenuButtonIcon"
            disabled={disabled}
            iconType="boxesVertical"
            onClick={toggleActionsMenu}
            aria-label={i18n.translate(
              'xpack.observabilityAiAssistant.chatActionsMenu.euiButtonIcon.menuLabel',
              { defaultMessage: 'Menu' }
            )}
          />
        </EuiToolTip>
      }
      panelPaddingSize="none"
      closePopover={toggleActionsMenu}
    >
      <EuiContextMenu
        initialPanelId={0}
        panels={[
          {
            id: 0,
            title: i18n.translate('xpack.observabilityAiAssistant.chatHeader.actions.title', {
              defaultMessage: 'Actions',
            }),
            items: [
              ...(showLinkToConversationsApp
                ? [
                    {
                      name: conversationId
                        ? i18n.translate(
                            'xpack.observabilityAiAssistant.chatHeader.actions.openInConversationsApp',
                            {
                              defaultMessage: 'Open in Conversations app',
                            }
                          )
                        : i18n.translate(
                            'xpack.observabilityAiAssistant.chatHeader.actions.goToConversationsApp',
                            {
                              defaultMessage: 'Go to Conversations app',
                            }
                          ),
                      href: conversationId
                        ? router.link('/conversations/{conversationId}', {
                            path: { conversationId },
                          })
                        : router.link('/conversations/new'),
                    },
                  ]
                : []),
              {
                name: i18n.translate(
                  'xpack.observabilityAiAssistant.chatHeader.actions.knowledgeBase',
                  {
                    defaultMessage: 'Manage knowledge base',
                  }
                ),
                onClick: () => {
                  toggleActionsMenu();
                  handleNavigateToSettingsKnowledgeBase();
                },
              },
              {
                name: i18n.translate('xpack.observabilityAiAssistant.chatHeader.actions.settings', {
                  defaultMessage: 'AI Assistant Settings',
                }),
                onClick: () => {
                  toggleActionsMenu();
                  handleNavigateToSettings();
                },
              },
              {
                name: (
                  <div className="eui-textTruncate">
                    {i18n.translate('xpack.observabilityAiAssistant.chatHeader.actions.connector', {
                      defaultMessage: 'Connector',
                    })}{' '}
                    <strong>
                      {
                        connectors.connectors?.find(({ id }) => id === connectors.selectedConnector)
                          ?.name
                      }
                    </strong>
                  </div>
                ),
                panel: 1,
              },
              {
                name: i18n.translate(
                  'xpack.observabilityAiAssistant.chatHeader.actions.copyConversation',
                  {
                    defaultMessage: 'Copy conversation',
                  }
                ),
                disabled: !conversationId,
                onClick: () => {
                  toggleActionsMenu();
                  onCopyConversationClick();
                },
              },
            ],
          },
          {
            id: 1,
            width: 256,
            title: i18n.translate('xpack.observabilityAiAssistant.chatHeader.actions.connector', {
              defaultMessage: 'Connector',
            }),
            content: (
              <EuiPanel>
                <ConnectorSelectorBase {...connectors} />
              </EuiPanel>
            ),
          },
        ]}
      />
    </EuiPopover>
  );
}
