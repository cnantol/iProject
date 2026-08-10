import { useEffect, useState } from 'react';
import api from '../api';

export const FIELD_LABEL_DEFAULTS = {
  order_id: 'ID',
  project_name: '项目名称',
  project_no: '项目编号',
  workshop: '车间',
  project_owner: '项目负责人',
  project_remark: '项目备注',
  end_customer: '最终客户',
  contract_customer: '合同客户',
  short_name: '客户简称',
  order_type: '项目类型',
  status: '状态',
  amount: '金额',
  sales_order: 'Sales Order',
  payment_terms: '付款条款',
  delivered_date: '发货日期',
  invoiced_date: '开票日期',
  commission_amount: '佣金金额'
};

export function useFieldLabels() {
  const [labels, setLabels] = useState(FIELD_LABEL_DEFAULTS);

  useEffect(() => {
    api
      .get('/settings/field-display-names')
      .then(({ data }) => setLabels({ ...FIELD_LABEL_DEFAULTS, ...data }))
      .catch(() => {});
  }, []);

  const t = (key) => labels[key] || FIELD_LABEL_DEFAULTS[key] || key;
  return { t };
}
