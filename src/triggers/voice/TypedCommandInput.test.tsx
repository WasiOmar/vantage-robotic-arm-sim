import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { act } from 'react';

describe('TypedCommandInput', () => {
  let dispatchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    dispatchSpy = vi.fn().mockResolvedValue('ACCEPTED');
    vi.doMock('../../bus/commandBus', () => ({
      commandBus: { dispatch: dispatchSpy },
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it('dispatches valid utterance with source:"typed" via commandBus.submit', async () => {
    const { default: Component } = await import('./TypedCommandInput');
    render(<Component />);

    const input = screen.getByPlaceholderText(/jog joint/i);
    const sendButton = screen.getByRole('button', { name: /send/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'jog joint 1 by 30 degrees' } });
      fireEvent.click(sendButton);
    });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const cmd = dispatchSpy.mock.calls[0]![0];
    expect(cmd.source).toBe('typed');
    expect(cmd.type).toBe('jog');
    expect(typeof cmd.id).toBe('string');
    expect(typeof cmd.timestamp).toBe('number');
  });

  it('shows rejected verdict pill for malformed input without dispatching', async () => {
    const { default: Component } = await import('./TypedCommandInput');
    render(<Component />);

    const input = screen.getByPlaceholderText(/jog joint/i);
    const sendButton = screen.getByRole('button', { name: /send/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'garbage text' } });
      fireEvent.click(sendButton);
    });

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(screen.getByText('REJECTED')).toBeDefined();
    expect(screen.getByText(/garbage text/i)).toBeDefined();
  });

  it('submits on Enter key', async () => {
    const { default: Component } = await import('./TypedCommandInput');
    render(<Component />);

    const input = screen.getByPlaceholderText(/jog joint/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'press key 3' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });
    });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const cmd = dispatchSpy.mock.calls[0]![0];
    expect(cmd.source).toBe('typed');
    expect(cmd.type).toBe('press_key');
  });

  it('keeps only the last 3 entries in history', async () => {
    const { default: Component } = await import('./TypedCommandInput');
    render(<Component />);

    const input = screen.getByPlaceholderText(/jog joint/i);
    const sendButton = screen.getByRole('button', { name: /send/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'jog joint 1 by 10 degrees' } });
      fireEvent.click(sendButton);
    });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'jog joint 1 by 10 degrees' } });
      fireEvent.click(sendButton);
    });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'garbage' } });
      fireEvent.click(sendButton);
    });

    const acceptedPills = screen.getAllByText('ACCEPTED');
    const rejectedPills = screen.getAllByText('REJECTED');
    expect(acceptedPills.length).toBe(2);
    expect(rejectedPills.length).toBe(1);
    expect(screen.getAllByText(/jog joint 1 by 10 degrees/i).length).toBe(2);
    expect(screen.getByText(/garbage/i)).toBeDefined();
  });

  it('overrides grammar source:"voice" to source:"typed"', async () => {
    const { default: Component } = await import('./TypedCommandInput');
    render(<Component />);

    const input = screen.getByPlaceholderText(/jog joint/i);
    const sendButton = screen.getByRole('button', { name: /send/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: 'enter pin 123456' } });
      fireEvent.click(sendButton);
    });

    const cmd = dispatchSpy.mock.calls[0]![0];
    expect(cmd.source).toBe('typed');
    expect(cmd.type).toBe('enter_pin');
  });
});
