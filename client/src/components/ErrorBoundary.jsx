import { Component } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    try {
      console.error('页面渲染异常:', error, info);
    } catch {
      // 静默兜底:即使 console.error 自身抛错(极端情况)也不能再次触发边界
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    try {
      if (this.state.hasError) {
        return (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '60vh',
              px: 2,
              textAlign: 'center'
            }}
          >
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
              页面渲染失败
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 560 }}>
              {String(this.state.error && (this.state.error.message || this.state.error))}
            </Typography>
            <Button variant="contained" onClick={this.reset}>
              重新加载
            </Button>
          </Box>
        );
      }
      return this.props.children;
    } catch {
      // 兜底自身渲染也炸了的极端场景:返回纯 HTML,不走任何 MUI 组件,
      // 确保用户至少看到错误提示 + 重载按钮,不会白屏
      return (
        <div style={{ padding: 32, textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h2 style={{ margin: '0 0 12px' }}>页面渲染失败</h2>
          <p style={{ color: '#666', margin: '0 0 16px' }}>
            界面组件发生严重错误,请点击下方按钮重新加载。
          </p>
          <button
            type="button"
            onClick={this.reset}
            style={{
              padding: '8px 20px',
              fontSize: 14,
              cursor: 'pointer',
              border: '1px solid #004E9A',
              background: '#004E9A',
              color: '#fff',
              borderRadius: 4
            }}
          >
            重新加载
          </button>
        </div>
      );
    }
  }
}
