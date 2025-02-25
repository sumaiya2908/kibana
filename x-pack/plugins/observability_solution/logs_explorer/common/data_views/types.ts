/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import * as rt from 'io-ts';

const dataTypeRT = rt.keyof({
  logs: null,
  unknown: null,
});

export const dataViewDescriptorRT = rt.exact(
  rt.intersection([
    rt.type({
      id: rt.string,
      name: rt.string,
      title: rt.string,
      dataType: dataTypeRT,
    }),
    rt.partial({
      kibanaSpaces: rt.array(rt.string),
      type: rt.string,
    }),
  ])
);

export type DataViewDescriptorType = rt.TypeOf<typeof dataViewDescriptorRT>;
