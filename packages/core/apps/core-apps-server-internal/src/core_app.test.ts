/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { registerBundleRoutesMock } from './core_app.test.mocks';

import { mockCoreContext } from '@kbn/core-base-server-mocks';
import { mockRouter } from '@kbn/core-http-router-server-mocks';
import type { UiPlugins } from '@kbn/core-plugins-base-server-internal';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { httpResourcesMock } from '@kbn/core-http-resources-server-mocks';
import { PluginType } from '@kbn/core-base-common';
import type { RequestHandlerContext } from '@kbn/core-http-request-handler-context-server';
import { coreInternalLifecycleMock } from '@kbn/core-lifecycle-server-mocks';
import { of } from 'rxjs';
import { CoreAppsService } from './core_app';

const emptyPlugins = (): UiPlugins => ({
  internal: new Map(),
  public: new Map(),
  browserConfigs: new Map(),
});

describe('CoreApp', () => {
  let coreContext: ReturnType<typeof mockCoreContext.create>;
  let coreApp: CoreAppsService;
  let internalCorePreboot: ReturnType<typeof coreInternalLifecycleMock.createInternalPreboot>;
  let prebootHTTPResourcesRegistrar: ReturnType<typeof httpResourcesMock.createRegistrar>;
  let internalCoreSetup: ReturnType<typeof coreInternalLifecycleMock.createInternalSetup>;
  let httpResourcesRegistrar: ReturnType<typeof httpResourcesMock.createRegistrar>;

  beforeEach(() => {
    coreContext = mockCoreContext.create();

    internalCorePreboot = coreInternalLifecycleMock.createInternalPreboot();

    internalCorePreboot.http.registerRoutes.mockImplementation((path, callback) =>
      callback(mockRouter.create())
    );
    prebootHTTPResourcesRegistrar = httpResourcesMock.createRegistrar();
    internalCorePreboot.httpResources.createRegistrar.mockReturnValue(
      prebootHTTPResourcesRegistrar
    );

    internalCoreSetup = coreInternalLifecycleMock.createInternalSetup();

    httpResourcesRegistrar = httpResourcesMock.createRegistrar();
    internalCoreSetup.httpResources.createRegistrar.mockReturnValue(httpResourcesRegistrar);
    coreApp = new CoreAppsService(coreContext);
  });

  afterEach(() => {
    registerBundleRoutesMock.mockReset();
  });

  describe('`/internal/core/_settings` route', () => {
    it('is not registered by default', async () => {
      const routerMock = mockRouter.create();
      internalCoreSetup.http.createRouter.mockReturnValue(routerMock);

      const localCoreApp = new CoreAppsService(coreContext);
      await localCoreApp.setup(internalCoreSetup, emptyPlugins());

      expect(routerMock.versioned.put).not.toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/internal/core/_settings',
        })
      );
    });

    it('is registered when enabled', async () => {
      const routerMock = mockRouter.create();
      internalCoreSetup.http.createRouter.mockReturnValue(routerMock);

      coreContext.configService.atPath.mockReturnValue(of({ allowDynamicConfigOverrides: true }));
      const localCoreApp = new CoreAppsService(coreContext);
      await localCoreApp.setup(internalCoreSetup, emptyPlugins());

      expect(routerMock.versioned.put).toHaveBeenCalledWith({
        path: '/internal/core/_settings',
        access: 'internal',
        options: {
          tags: ['access:updateDynamicConfig'],
        },
      });
    });
  });

  describe('`/status` route', () => {
    it('is registered with `authRequired: false` is the status page is anonymous', async () => {
      internalCoreSetup.status.isStatusPageAnonymous.mockReturnValue(true);
      await coreApp.setup(internalCoreSetup, emptyPlugins());

      expect(httpResourcesRegistrar.register).toHaveBeenCalledWith(
        {
          path: '/status',
          validate: false,
          options: {
            authRequired: false,
          },
        },
        expect.any(Function)
      );
    });

    it('is registered with `authRequired: true` is the status page is not anonymous', async () => {
      internalCoreSetup.status.isStatusPageAnonymous.mockReturnValue(false);
      await coreApp.setup(internalCoreSetup, emptyPlugins());

      expect(httpResourcesRegistrar.register).toHaveBeenCalledWith(
        {
          path: '/status',
          validate: false,
          options: {
            authRequired: true,
          },
        },
        expect.any(Function)
      );
    });
  });

  describe('#preboot', () => {
    let prebootUIPlugins: UiPlugins;
    beforeEach(() => {
      prebootUIPlugins = emptyPlugins();
      prebootUIPlugins.public.set('some-plugin', {
        type: PluginType.preboot,
        configPath: 'some-plugin',
        id: 'some-plugin',
        optionalPlugins: [],
        requiredBundles: [],
        requiredPlugins: [],
        runtimePluginDependencies: [],
      });
    });
    it('calls `registerBundleRoutes` with the correct options', () => {
      coreApp.preboot(internalCorePreboot, prebootUIPlugins);

      expect(registerBundleRoutesMock).toHaveBeenCalledTimes(1);
      expect(registerBundleRoutesMock).toHaveBeenCalledWith({
        uiPlugins: prebootUIPlugins,
        router: expect.any(Object),
        packageInfo: coreContext.env.packageInfo,
        staticAssets: expect.any(Object),
      });
    });

    it('does not call `registerBundleRoutes` if there are no `preboot` UI plugins', () => {
      coreApp.preboot(internalCorePreboot, emptyPlugins());

      expect(registerBundleRoutesMock).not.toHaveBeenCalled();
    });

    it('main route handles core app rendering', () => {
      coreApp.preboot(internalCorePreboot, prebootUIPlugins);

      expect(prebootHTTPResourcesRegistrar.register).toHaveBeenCalledWith(
        {
          path: '/{path*}',
          validate: expect.any(Object),
        },
        expect.any(Function)
      );

      const [[, handler]] = prebootHTTPResourcesRegistrar.register.mock.calls;
      const mockResponseFactory = httpResourcesMock.createResponseFactory();
      handler(
        {} as unknown as RequestHandlerContext,
        httpServerMock.createKibanaRequest(),
        mockResponseFactory
      );

      expect(mockResponseFactory.renderCoreApp).toHaveBeenCalled();
    });

    it('main route handles unknown public API requests', () => {
      coreApp.preboot(internalCorePreboot, prebootUIPlugins);

      const [[, handler]] = prebootHTTPResourcesRegistrar.register.mock.calls;
      const mockResponseFactory = httpResourcesMock.createResponseFactory();
      handler(
        {} as unknown as RequestHandlerContext,
        httpServerMock.createKibanaRequest({ path: '/api/status' }),
        mockResponseFactory
      );

      expect(mockResponseFactory.renderCoreApp).not.toHaveBeenCalled();
      expect(mockResponseFactory.customError).toHaveBeenCalledWith({
        statusCode: 503,
        headers: { 'Retry-After': '30' },
        body: 'Kibana server is not ready yet',
        bypassErrorFormat: true,
      });
    });

    it('main route handles unknown internal API requests', () => {
      coreApp.preboot(internalCorePreboot, prebootUIPlugins);

      const [[, handler]] = prebootHTTPResourcesRegistrar.register.mock.calls;
      const mockResponseFactory = httpResourcesMock.createResponseFactory();
      handler(
        {} as unknown as RequestHandlerContext,
        httpServerMock.createKibanaRequest({ path: '/internal/security/me' }),
        mockResponseFactory
      );

      expect(mockResponseFactory.renderCoreApp).not.toHaveBeenCalled();
      expect(mockResponseFactory.customError).toHaveBeenCalledWith({
        statusCode: 503,
        headers: { 'Retry-After': '30' },
        body: 'Kibana server is not ready yet',
        bypassErrorFormat: true,
      });
    });
  });

  describe('`/app/{id}/{any*}` route', () => {
    it('is registered with the correct parameters', async () => {
      await coreApp.setup(internalCoreSetup, emptyPlugins());

      expect(httpResourcesRegistrar.register).toHaveBeenCalledWith(
        {
          path: '/app/{id}/{any*}',
          validate: false,
          options: {
            authRequired: true,
          },
        },
        expect.any(Function)
      );
    });
  });

  it('`setup` calls `registerBundleRoutes` with the correct options', async () => {
    const uiPlugins = emptyPlugins();
    await coreApp.setup(internalCoreSetup, uiPlugins);

    expect(registerBundleRoutesMock).toHaveBeenCalledTimes(1);
    expect(registerBundleRoutesMock).toHaveBeenCalledWith({
      uiPlugins,
      router: expect.any(Object),
      packageInfo: coreContext.env.packageInfo,
      staticAssets: expect.any(Object),
    });
  });

  it('registers SHA-scoped and non-SHA-scoped UI bundle routes', async () => {
    const uiPlugins = emptyPlugins();
    internalCoreSetup.http.staticAssets.prependServerPath.mockReturnValue('/some-path');
    await coreApp.setup(internalCoreSetup, uiPlugins);

    expect(internalCoreSetup.http.registerStaticDir).toHaveBeenCalledTimes(2);
    expect(internalCoreSetup.http.registerStaticDir).toHaveBeenCalledWith(
      '/some-path',
      expect.any(String)
    );
    expect(internalCoreSetup.http.registerStaticDir).toHaveBeenCalledWith(
      '/ui/{path*}',
      expect.any(String)
    );
  });
});
