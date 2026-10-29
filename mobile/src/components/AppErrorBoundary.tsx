import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { brand, radii } from "../constants/theme";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes and shows something usable.
 *
 * A game that white-screens on a bad payload looks broken in a way that gets
 * a one-star review, so this always offers a way out.
 */
export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[app-error]", error.message, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.root}>
          <Text style={styles.emoji}>😵</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>{this.state.error.message}</Text>

          <Pressable onPress={this.reset} style={styles.button} accessibilityRole="button">
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: brand.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  emoji: { fontSize: 48 },
  title: {
    color: brand.text,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 14,
    textAlign: "center",
  },
  body: {
    color: brand.muted,
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 1.6,
  },
  button: {
    marginTop: 24,
    backgroundColor: brand.accent,
    borderRadius: radii.md,
    paddingVertical: 13,
    paddingHorizontal: 34,
  },
  buttonText: { color: brand.white, fontWeight: "900", fontSize: 15 },
});