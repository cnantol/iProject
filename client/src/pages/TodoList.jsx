import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import api, { errorMessage } from '../api';
import { useConfirm } from '../components/ConfirmDialog';
import { PRIORITY_LABELS, PRIORITY_COLORS } from '../utils/constants';
import { todayStr, fmtDateTime, overdueDays } from '../utils/helpers';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
const HOLIDAYS_BY_YEAR = {
  2021: {
    '2021-01-01': '元旦', '2021-01-02': '元旦', '2021-01-03': '元旦',
    '2021-02-11': '春节', '2021-02-12': '春节', '2021-02-13': '春节', '2021-02-14': '春节', '2021-02-15': '春节', '2021-02-16': '春节', '2021-02-17': '春节',
    '2021-04-03': '清明节', '2021-04-04': '清明节', '2021-04-05': '清明节',
    '2021-05-01': '劳动节', '2021-05-02': '劳动节', '2021-05-03': '劳动节', '2021-05-04': '劳动节', '2021-05-05': '劳动节',
    '2021-06-12': '端午节', '2021-06-13': '端午节', '2021-06-14': '端午节',
    '2021-09-19': '中秋节', '2021-09-20': '中秋节', '2021-09-21': '中秋节',
    '2021-10-01': '国庆节', '2021-10-02': '国庆节', '2021-10-03': '国庆节', '2021-10-04': '国庆节', '2021-10-05': '国庆节', '2021-10-06': '国庆节', '2021-10-07': '国庆节'
  },
  2022: {
    '2022-01-01': '元旦', '2022-01-02': '元旦', '2022-01-03': '元旦',
    '2022-01-31': '春节', '2022-02-01': '春节', '2022-02-02': '春节', '2022-02-03': '春节', '2022-02-04': '春节', '2022-02-05': '春节', '2022-02-06': '春节',
    '2022-04-03': '清明节', '2022-04-04': '清明节', '2022-04-05': '清明节',
    '2022-04-30': '劳动节', '2022-05-01': '劳动节', '2022-05-02': '劳动节', '2022-05-03': '劳动节', '2022-05-04': '劳动节',
    '2022-06-03': '端午节', '2022-06-04': '端午节', '2022-06-05': '端午节',
    '2022-09-10': '中秋节', '2022-09-11': '中秋节', '2022-09-12': '中秋节',
    '2022-10-01': '国庆节', '2022-10-02': '国庆节', '2022-10-03': '国庆节', '2022-10-04': '国庆节', '2022-10-05': '国庆节', '2022-10-06': '国庆节', '2022-10-07': '国庆节'
  },
  2023: {
    '2023-01-01': '元旦', '2023-01-02': '元旦',
    '2023-01-21': '春节', '2023-01-22': '春节', '2023-01-23': '春节', '2023-01-24': '春节', '2023-01-25': '春节', '2023-01-26': '春节', '2023-01-27': '春节',
    '2023-04-05': '清明节',
    '2023-04-29': '劳动节', '2023-04-30': '劳动节', '2023-05-01': '劳动节', '2023-05-02': '劳动节', '2023-05-03': '劳动节',
    '2023-06-22': '端午节', '2023-06-23': '端午节', '2023-06-24': '端午节',
    '2023-09-29': '中秋节', '2023-09-30': '中秋节', '2023-10-01': '中秋节', '2023-10-02': '中秋节', '2023-10-03': '中秋节', '2023-10-04': '中秋节', '2023-10-05': '中秋节', '2023-10-06': '中秋节'
  },
  2024: {
    '2024-01-01': '元旦',
    '2024-02-10': '春节', '2024-02-11': '春节', '2024-02-12': '春节', '2024-02-13': '春节', '2024-02-14': '春节', '2024-02-15': '春节', '2024-02-16': '春节', '2024-02-17': '春节',
    '2024-04-04': '清明节', '2024-04-05': '清明节', '2024-04-06': '清明节',
    '2024-05-01': '劳动节', '2024-05-02': '劳动节', '2024-05-03': '劳动节', '2024-05-04': '劳动节', '2024-05-05': '劳动节',
    '2024-06-08': '端午节', '2024-06-09': '端午节', '2024-06-10': '端午节',
    '2024-09-15': '中秋节', '2024-09-16': '中秋节', '2024-09-17': '中秋节',
    '2024-10-01': '国庆节', '2024-10-02': '国庆节', '2024-10-03': '国庆节', '2024-10-04': '国庆节', '2024-10-05': '国庆节', '2024-10-06': '国庆节', '2024-10-07': '国庆节'
  },
  2025: {
    '2025-01-01': '元旦',
    '2025-01-28': '春节', '2025-01-29': '春节', '2025-01-30': '春节', '2025-01-31': '春节', '2025-02-01': '春节', '2025-02-02': '春节', '2025-02-03': '春节', '2025-02-04': '春节',
    '2025-04-04': '清明节', '2025-04-05': '清明节', '2025-04-06': '清明节',
    '2025-05-01': '劳动节', '2025-05-02': '劳动节', '2025-05-03': '劳动节', '2025-05-04': '劳动节', '2025-05-05': '劳动节',
    '2025-05-31': '端午节', '2025-06-01': '端午节', '2025-06-02': '端午节',
    '2025-10-01': '国庆节', '2025-10-02': '国庆节', '2025-10-03': '国庆节', '2025-10-04': '国庆节', '2025-10-05': '国庆节', '2025-10-06': '国庆节', '2025-10-07': '国庆节', '2025-10-08': '国庆节'
  },
  2026: {
    '2026-01-01': '元旦',
    '2026-01-02': '元旦',
    '2026-01-03': '元旦',
    '2026-02-16': '春节',
    '2026-02-17': '春节',
    '2026-02-18': '春节',
    '2026-02-19': '春节',
    '2026-02-20': '春节',
    '2026-02-21': '春节',
    '2026-02-22': '春节',
    '2026-04-04': '清明节',
    '2026-04-05': '清明节',
    '2026-04-06': '清明节',
    '2026-05-01': '劳动节',
    '2026-05-02': '劳动节',
    '2026-05-03': '劳动节',
    '2026-05-04': '劳动节',
    '2026-05-05': '劳动节',
    '2026-06-19': '端午节',
    '2026-06-20': '端午节',
    '2026-06-21': '端午节',
    '2026-09-25': '中秋节',
    '2026-09-26': '中秋节',
    '2026-09-27': '中秋节',
    '2026-10-01': '国庆节',
    '2026-10-02': '国庆节',
    '2026-10-03': '国庆节',
    '2026-10-04': '国庆节',
    '2026-10-05': '国庆节',
    '2026-10-06': '国庆节',
    '2026-10-07': '国庆节'
  },
  2027: {
    '2027-01-01': '元旦', '2027-01-02': '元旦', '2027-01-03': '元旦',
    '2027-02-06': '春节', '2027-02-07': '春节', '2027-02-08': '春节', '2027-02-09': '春节', '2027-02-10': '春节', '2027-02-11': '春节', '2027-02-12': '春节',
    '2027-04-05': '清明节',
    '2027-05-01': '劳动节', '2027-05-02': '劳动节', '2027-05-03': '劳动节', '2027-05-04': '劳动节', '2027-05-05': '劳动节',
    '2027-06-09': '端午节', '2027-06-10': '端午节', '2027-06-11': '端午节',
    '2027-09-15': '中秋节', '2027-09-16': '中秋节', '2027-09-17': '中秋节',
    '2027-10-01': '国庆节', '2027-10-02': '国庆节', '2027-10-03': '国庆节', '2027-10-04': '国庆节', '2027-10-05': '国庆节', '2027-10-06': '国庆节', '2027-10-07': '国庆节'
  },
  2028: {
    '2028-01-01': '元旦', '2028-01-02': '元旦', '2028-01-03': '元旦',
    '2028-01-26': '春节', '2028-01-27': '春节', '2028-01-28': '春节', '2028-01-29': '春节', '2028-01-30': '春节', '2028-01-31': '春节', '2028-02-01': '春节',
    '2028-04-04': '清明节',
    '2028-04-29': '劳动节', '2028-04-30': '劳动节', '2028-05-01': '劳动节', '2028-05-02': '劳动节', '2028-05-03': '劳动节',
    '2028-05-28': '端午节', '2028-05-29': '端午节', '2028-05-30': '端午节',
    '2028-10-01': '国庆节', '2028-10-02': '国庆节', '2028-10-03': '国庆节', '2028-10-04': '国庆节', '2028-10-05': '国庆节', '2028-10-06': '国庆节', '2028-10-07': '国庆节'
  },
  2029: {
    '2029-01-01': '元旦', '2029-01-02': '元旦', '2029-01-03': '元旦',
    '2029-02-13': '春节', '2029-02-14': '春节', '2029-02-15': '春节', '2029-02-16': '春节', '2029-02-17': '春节', '2029-02-18': '春节', '2029-02-19': '春节',
    '2029-04-04': '清明节',
    '2029-05-01': '劳动节', '2029-05-02': '劳动节', '2029-05-03': '劳动节', '2029-05-04': '劳动节', '2029-05-05': '劳动节',
    '2029-06-16': '端午节', '2029-06-17': '端午节', '2029-06-18': '端午节',
    '2029-09-22': '中秋节', '2029-09-23': '中秋节', '2029-09-24': '中秋节',
    '2029-10-01': '国庆节', '2029-10-02': '国庆节', '2029-10-03': '国庆节', '2029-10-04': '国庆节', '2029-10-05': '国庆节', '2029-10-06': '国庆节', '2029-10-07': '国庆节'
  },
  2030: {
    '2030-01-01': '元旦', '2030-01-02': '元旦', '2030-01-03': '元旦',
    '2030-02-03': '春节', '2030-02-04': '春节', '2030-02-05': '春节', '2030-02-06': '春节', '2030-02-07': '春节', '2030-02-08': '春节', '2030-02-09': '春节',
    '2030-04-05': '清明节',
    '2030-05-01': '劳动节', '2030-05-02': '劳动节', '2030-05-03': '劳动节', '2030-05-04': '劳动节', '2030-05-05': '劳动节',
    '2030-06-05': '端午节', '2030-06-06': '端午节', '2030-06-07': '端午节',
    '2030-09-12': '中秋节', '2030-09-13': '中秋节', '2030-09-14': '中秋节',
    '2030-10-01': '国庆节', '2030-10-02': '国庆节', '2030-10-03': '国庆节', '2030-10-04': '国庆节', '2030-10-05': '国庆节', '2030-10-06': '国庆节', '2030-10-07': '国庆节'
  },
  2031: {
    '2031-01-01': '元旦', '2031-01-02': '元旦', '2031-01-03': '元旦',
    '2031-01-23': '春节', '2031-01-24': '春节', '2031-01-25': '春节', '2031-01-26': '春节', '2031-01-27': '春节', '2031-01-28': '春节', '2031-01-29': '春节',
    '2031-04-05': '清明节',
    '2031-05-01': '劳动节', '2031-05-02': '劳动节', '2031-05-03': '劳动节', '2031-05-04': '劳动节', '2031-05-05': '劳动节',
    '2031-06-24': '端午节', '2031-06-25': '端午节', '2031-06-26': '端午节',
    '2031-10-01': '国庆节', '2031-10-02': '国庆节', '2031-10-03': '国庆节', '2031-10-04': '国庆节', '2031-10-05': '国庆节', '2031-10-06': '国庆节', '2031-10-07': '国庆节'
  }
};
const isWeekend = (dateStr) => {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  return day === 0 || day === 6;
};
const SOLAR_TERM_INFO = [0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551, 218072, 240693, 263343, 285989, 308563, 331033, 353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758];
const SOLAR_TERM_NAMES = ['小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'];

function solarTermsForYear(year) {
  const map = {};
  const base = Date.UTC(1900, 0, 6, 2, 5);
  for (let n = 0; n < 24; n += 1) {
    const date = new Date(base + 31556925974.7 * (year - 1900) + SOLAR_TERM_INFO[n] * 60000);
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    map[`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`] = SOLAR_TERM_NAMES[n];
  }
  return map;
}
const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520
];
const LUNAR_DAY_NAMES = ['', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
const lunarLeapMonth = (year) => LUNAR_INFO[year - 1900] & 0xf;
const lunarLeapDays = (year) => (lunarLeapMonth(year) ? (LUNAR_INFO[year - 1900] & 0x10000 ? 30 : 29) : 0);
const lunarMonthDays = (year, month) => (LUNAR_INFO[year - 1900] & (0x10000 >> month) ? 30 : 29);
const lunarYearDays = (year) => {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) sum += LUNAR_INFO[year - 1900] & i ? 1 : 0;
  return sum + lunarLeapDays(year);
};
const lunarDay = (dateStr) => {
  const date = new Date(`${dateStr}T00:00:00`);
  let year = date.getFullYear();
  let offset = Math.floor((Date.UTC(year, date.getMonth(), date.getDate()) - Date.UTC(1900, 0, 31)) / 86400000);
  let temp = 0;
  for (let i = 1900; i < 2101 && offset > 0; i += 1) {
    temp = lunarYearDays(i);
    offset -= temp;
  }
  if (offset < 0) {
    offset += temp;
    year -= 1;
  }
  const leap = lunarLeapMonth(year);
  let isLeap = false;
  let month = 0;
  for (let i = 1; i < 13 && offset > 0; i += 1) {
    if (leap > 0 && i === leap + 1 && !isLeap) {
      i -= 1;
      isLeap = true;
      temp = lunarLeapDays(year);
    } else {
      temp = lunarMonthDays(year, i);
    }
    if (isLeap && i === leap + 1) isLeap = false;
    offset -= temp;
    month = i;
  }
  if (offset === 0 && leap > 0 && month === leap + 1) {
    isLeap = true;
    month -= 1;
  }
  if (offset < 0) {
    offset += temp;
    month -= 1;
  }
  return LUNAR_DAY_NAMES[offset + 1] || `${offset + 1}`;
};

export default function TodoList() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [detailDate, setDetailDate] = useState(null);
  const [todos, setTodos] = useState([]);
  const [orders, setOrders] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortMode, setSortMode] = useState('priority');
  const [showDone, setShowDone] = useState(false);
  const [quick, setQuick] = useState({ title: '', priority: 'medium', due_date: todayStr(), order_ref: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [todoRes, orderRes] = await Promise.all([api.get('/todos', { params: { limit: 500 } }), api.get('/orders', { params: { limit: 100, scope: 'active' } })]);
      setTodos(todoRes.data.items || []);
      setOrders(orderRes.data.items || []);
      setError('');
    } catch (err) {
      setError(errorMessage(err, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = todayStr();
  const filtered = useMemo(() => todos.filter((todo) => !priorityFilter || todo.priority === priorityFilter), [todos, priorityFilter]);
  const openTodos = filtered.filter((todo) => Number(todo.is_completed) === 0);
  const doneTodos = filtered.filter((todo) => Number(todo.is_completed) === 1);

  const groupSort = (rows) =>
    [...rows].sort((a, b) => {
      if (sortMode === 'priority') {
        const pa = PRIORITY_ORDER[a.priority] ?? 9;
        const pb = PRIORITY_ORDER[b.priority] ?? 9;
        if (pa !== pb) return pa - pb;
      }
      if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : 1;
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });

  const overdue = groupSort(openTodos.filter((todo) => todo.due_date && todo.due_date < today));
  const todayList = groupSort(openTodos.filter((todo) => todo.due_date === today));
  const future = groupSort(openTodos.filter((todo) => !todo.due_date || todo.due_date > today));

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const firstWeekday = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % 7;
  const dateKey = (day) => `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const todoDates = new Set(openTodos.map((todo) => todo.due_date).filter(Boolean));
  const solarTerms = useMemo(() => solarTermsForYear(cursor.year), [cursor.year]);
  const calendarRows = [];
  let rowCells = Array.from({ length: firstWeekday }).map(() => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    rowCells.push(dateKey(day));
    if (rowCells.length === 7) {
      calendarRows.push(rowCells);
      rowCells = [];
    }
  }
  if (rowCells.length > 0) {
    while (rowCells.length < 7) rowCells.push(null);
    calendarRows.push(rowCells);
  }

  const toggle = async (todo) => {
    try {
      await api.patch(`/todos/${todo.id}/toggle`, { is_completed: Number(todo.is_completed) === 1 ? 0 : 1 });
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async (todo) => {
    if (!(await confirm('确认删除该待办？'))) return;
    try {
      await api.delete(`/todos/${todo.id}`);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const addQuick = async () => {
    if (!quick.title.trim()) {
      setError('待办标题必填');
      return;
    }
    setError('');
    try {
      await api.post('/todos', {
        title: quick.title.trim(),
        priority: quick.priority,
        due_date: quick.due_date || null,
        order_ref: quick.order_ref ? Number(quick.order_ref) : null
      });
      setQuick({ title: '', priority: 'medium', due_date: selectedDate || today, order_ref: '' });
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const renderList = (rows, emptyText) => (
    <Box>
      {rows.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>
          {emptyText}
        </Typography>
      )}
      {rows.map((todo) => (
        <ListItem
          key={todo.id}
          disableGutters
          sx={{ mb: 0.5 }}
          secondaryAction={
            <IconButton edge="end" size="small" onClick={() => remove(todo)} title="删除">
              <DeleteIcon />
            </IconButton>
          }
        >
          <ListItemIcon>
            <Checkbox checked={Number(todo.is_completed) === 1} onChange={() => toggle(todo)} color="success" />
          </ListItemIcon>
          <ListItemButton sx={{ borderRadius: 1.5, px: 1.5 }} onClick={() => todo.order_ref && navigate(`/orders/${todo.order_ref}`)}>
            <ListItemText
              primary={todo.title}
              secondary={
                <>
                  <Chip size="small" sx={{ bgcolor: `${PRIORITY_COLORS[todo.priority]}22`, color: PRIORITY_COLORS[todo.priority] }} label={PRIORITY_LABELS[todo.priority] || todo.priority} />
                  {todo.due_date ? ` 截止 ${todo.due_date}` : ' 无截止日期'}
                  {todo.due_date && todo.due_date < today && `（已逾期 ${overdueDays(todo.due_date)} 天）`}
                  {todo.order_number ? ` ｜ ${todo.order_number}` : ''}
                  {Number(todo.is_completed) === 1 && todo.completed_at ? ` ｜ 完成于 ${fmtDateTime(todo.completed_at)}` : ''}
                </>
              }
              secondaryTypographyProps={{ component: 'span' }}
              sx={{ textDecoration: Number(todo.is_completed) === 1 ? 'line-through' : 'none', color: Number(todo.is_completed) === 1 ? 'text.disabled' : 'inherit' }}
            />
          </ListItemButton>
        </ListItem>
      ))}
    </Box>
  );

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">待办事项</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
          按逾期、今日、未来与已完成四区管理个人日程
        </Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>快速新增</Typography>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <TextField size="small" label="标题（必填）" value={quick.title} onChange={(e) => setQuick((prev) => ({ ...prev, title: e.target.value }))} sx={{ flex: 1 }} />
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>优先级</InputLabel>
              <Select value={quick.priority} label="优先级" onChange={(e) => setQuick((prev) => ({ ...prev, priority: e.target.value }))}>
                {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                  <MenuItem key={key} value={key}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField size="small" label="截止日期" type="date" value={quick.due_date} onChange={(e) => setQuick((prev) => ({ ...prev, due_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>关联销售机会</InputLabel>
              <Select
                value={quick.order_ref}
                label="关联销售机会"
                onChange={(e) => setQuick((prev) => ({ ...prev, order_ref: e.target.value }))}
                sx={{
                  borderRadius: 2.5,
                  '& .MuiInputBase-input': { fontSize: 14, fontWeight: 500 },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' }
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      borderRadius: 2.5,
                      '& .MuiMenuItem-root': { fontSize: 14, minHeight: 42, fontWeight: 500 }
                    }
                  }
                }}
              >
                <MenuItem value="">不关联</MenuItem>
                {orders.map((order) => (
                  <MenuItem key={order.id} value={order.id}>
                    {order.order_id} · {order.project_name || '-'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="contained" startIcon={<AddIcon />} onClick={addQuick} sx={{ whiteSpace: 'nowrap' }}>
              快速新增
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
            <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <IconButton
                  onClick={() => setCursor((prev) => (prev.month === 0 ? { year: prev.year - 1, month: 11 } : { ...prev, month: prev.month - 1 }))}
                  sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
                >
                  <ChevronLeftIcon />
                </IconButton>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  {cursor.year} 年 {cursor.month + 1} 月
                </Typography>
                <IconButton
                  onClick={() => setCursor((prev) => (prev.month === 11 ? { year: prev.year + 1, month: 0 } : { ...prev, month: prev.month + 1 }))}
                  sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
                >
                  <ChevronRightIcon />
                </IconButton>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1, mt: 1 }}>
                {WEEKDAYS.map((day) => (
                  <Typography key={day} variant="caption" align="center" color="text.secondary" sx={{ fontWeight: 700, py: 0.5 }}>
                    {day}
                  </Typography>
                ))}
                {calendarRows.map((row, rowIndex) => {
                  return (
                    <Fragment key={`row-${rowIndex}`}>
                      {row.map((key) => {
                        if (!key) return <Box key={`empty-${rowIndex}`} />;
                        const day = Number(key.slice(8));
                        const hasTodo = todoDates.has(key);
                        const todoCount = openTodos.filter((todo) => todo.due_date === key).length;
                        const selected = key === selectedDate;
                        const isToday = key === today;
                        const holiday = (HOLIDAYS_BY_YEAR[cursor.year] || {})[key];
                        const weekend = isWeekend(key);
                        const solarTerm = solarTerms[key];
                        const lunar = lunarDay(key);
                        const caption = holiday || solarTerm || lunar;
                        return (
                          <Box
                            key={key}
                            title={holiday || undefined}
                            onClick={() => {
                              setSelectedDate(key);
                              if (todoCount > 0) setDetailDate(key);
                            }}
                            sx={{
                              minHeight: { xs: 56, sm: 64 },
                              width: '100%',
                              minWidth: 0,
                              overflow: 'hidden',
                              boxSizing: 'border-box',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 2,
                              cursor: 'pointer',
                              bgcolor: selected ? 'primary.main' : holiday ? 'rgba(195, 61, 61, 0.08)' : weekend ? 'action.hover' : 'transparent',
                              color: selected ? 'primary.contrastText' : 'inherit',
                              position: 'relative',
                              border: isToday && !selected ? '1.5px solid' : '1px solid transparent',
                              borderColor: 'primary.main',
                              fontSize: 14,
                              fontWeight: isToday ? 800 : 500,
                              '&:hover': { bgcolor: selected ? 'primary.main' : 'action.hover', transform: 'translateY(-2px)', boxShadow: 2 },
                              transition: 'background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease'
                            }}
                          >
                            {day}
                            {holiday && (
                              <Box sx={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, px: 0.5, borderRadius: 1, bgcolor: selected ? 'rgba(255,255,255,0.85)' : '#C33D3D', color: selected ? '#C33D3D' : '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                节
                              </Box>
                            )}
                            {hasTodo && (
                              <Box sx={{ position: 'absolute', bottom: 2, right: 2, minWidth: 16, height: 16, px: 0.5, borderRadius: 8, bgcolor: selected ? 'rgba(255,255,255,0.85)' : 'primary.main', color: selected ? 'primary.main' : '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {todoCount}
                              </Box>
                            )}
                            {caption && (
                              <Box sx={{ position: 'absolute', bottom: 3, left: 3, right: 3, textAlign: 'center', fontSize: holiday || solarTerm ? 11 : 10, lineHeight: 1.2, color: selected ? '#fff' : holiday || solarTerm ? '#C33D3D' : 'text.secondary', fontWeight: holiday || solarTerm ? 800 : 500, bgcolor: holiday || solarTerm ? (selected ? 'rgba(255,255,255,0.2)' : 'rgba(195,61,61,0.10)') : 'transparent', borderRadius: 1, px: 0.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {caption}
                              </Box>
                            )}
                          </Box>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </Box>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Stack spacing={2}>
                  <Box sx={{ p: 1.25, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>优先级</Typography>
                        <ToggleButtonGroup size="small" exclusive value={priorityFilter} onChange={(_, value) => setPriorityFilter(value || '')}>
                          <ToggleButton value="">全部</ToggleButton>
                          {Object.keys(PRIORITY_LABELS).map((key) => (
                            <ToggleButton key={key} value={key}>
                              {PRIORITY_LABELS[key]}
                            </ToggleButton>
                          ))}
                        </ToggleButtonGroup>
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>排序</Typography>
                        <ToggleButtonGroup size="small" exclusive value={sortMode} onChange={(_, value) => setSortMode(value || 'priority')}>
                          <ToggleButton value="priority">按优先级</ToggleButton>
                          <ToggleButton value="date">按日期</ToggleButton>
                        </ToggleButtonGroup>
                      </Stack>
                    </Stack>
                  </Box>
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Box sx={{ width: 4, height: 20, borderRadius: 2, bgcolor: '#C33D3D' }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'error.main' }}>
                        已逾期
                      </Typography>
                      <Chip size="small" label={overdue.length} sx={{ height: 20, bgcolor: 'rgba(195, 61, 61, 0.10)', color: '#C33D3D', fontWeight: 700 }} />
                    </Stack>
                    {renderList(overdue, '无逾期待办')}
                  </Box>
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Box sx={{ width: 4, height: 20, borderRadius: 2, bgcolor: '#004E9A' }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'primary.main' }}>
                        今天到期
                      </Typography>
                      <Chip size="small" label={todayList.length} sx={{ height: 20, bgcolor: 'rgba(0, 78, 154, 0.10)', color: 'primary.main', fontWeight: 700 }} />
                    </Stack>
                    {renderList(todayList, '今天无到期待办')}
                  </Box>
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Box sx={{ width: 4, height: 20, borderRadius: 2, bgcolor: '#0093BE' }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                        未来
                      </Typography>
                      <Chip size="small" label={future.length} sx={{ height: 20, bgcolor: 'rgba(0, 147, 190, 0.10)', color: '#0093BE', fontWeight: 700 }} />
                    </Stack>
                    {renderList(future, '暂无未来待办')}
                  </Box>
                  <Box>
                    <Button size="small" endIcon={showDone ? <ExpandLessIcon /> : <ExpandMoreIcon />} onClick={() => setShowDone((prev) => !prev)}>
                      已完成（{doneTodos.length}）
                    </Button>
                    <Collapse in={showDone}>
                      {renderList(groupSort(doneTodos), '暂无已完成待办')}
                    </Collapse>
                  </Box>
                </Stack>
              )}
            </CardContent>
          </Card>
      <Dialog open={Boolean(detailDate)} onClose={() => setDetailDate(null)} maxWidth="sm" fullWidth>
        <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
        <DialogTitle>待办详情</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
            {detailDate}（{detailDate ? openTodos.filter((todo) => todo.due_date === detailDate).length : 0} 项）
          </Typography>
          {detailDate && renderList(groupSort(openTodos.filter((todo) => todo.due_date === detailDate)), '该日期无待办')}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDate(null)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
