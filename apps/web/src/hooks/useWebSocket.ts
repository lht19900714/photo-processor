import { ref } from 'vue';
import type { ServerWSEvent, ClientWSEvent } from '@photo-processor/shared';

type EventHandler = (event: ServerWSEvent) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private handlers: Set<EventHandler> = new Set();
  private subscribedTasks: Set<number> = new Set();

  public connected = ref(false);
  public error = ref<string | null>(null);

  connect(token: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.connected.value = true;
        this.error.value = null;
        this.reconnectAttempts = 0;

        // Re-subscribe to tasks
        for (const taskId of this.subscribedTasks) {
          this.send({ type: 'subscribe', taskId });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ServerWSEvent;
          for (const handler of this.handlers) {
            handler(data);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.connected.value = false;
        this.ws = null;

        // Auto-reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(
            `Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
          );
          setTimeout(() => this.connect(token), this.reconnectDelay);
        } else {
          this.error.value = 'Connection lost. Please refresh the page.';
        }
      };

      this.ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        this.error.value = 'Connection error';
      };
    } catch (e) {
      console.error('Failed to create WebSocket:', e);
      this.error.value = 'Failed to connect';
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected.value = false;
    this.subscribedTasks.clear();
  }

  private send(message: ClientWSEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  subscribe(taskId: number): void {
    this.subscribedTasks.add(taskId);
    this.send({ type: 'subscribe', taskId });
  }

  unsubscribe(taskId: number): void {
    this.subscribedTasks.delete(taskId);
    this.send({ type: 'unsubscribe', taskId });
  }

  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null;

export function useWebSocket() {
  if (!wsClient) {
    wsClient = new WebSocketClient();
  }

  return {
    connected: wsClient.connected,
    error: wsClient.error,
    connect: (token: string) => wsClient!.connect(token),
    disconnect: () => wsClient!.disconnect(),
    subscribe: (taskId: number) => wsClient!.subscribe(taskId),
    unsubscribe: (taskId: number) => wsClient!.unsubscribe(taskId),
    onEvent: (handler: EventHandler) => wsClient!.onEvent(handler),
  };
}
