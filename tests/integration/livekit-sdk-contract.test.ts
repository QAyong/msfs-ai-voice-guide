import { cli, defineAgent, ServerOptions } from '@livekit/agents';
import { describe, expect, it } from 'vitest';

describe('LiveKit Agents SDK contract', () => {
  it('exposes the worker APIs selected for this project', () => {
    expect(defineAgent).toBeTypeOf('function');
    expect(ServerOptions).toBeTypeOf('function');
    expect(cli.runApp).toBeTypeOf('function');
  });
});
