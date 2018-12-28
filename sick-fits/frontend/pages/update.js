import React from "react";
import UpdateItem from "../components/UpdateItem";

const Update = props => {
  return (
    <div>
      <UpdateItem id={props.query.id} />
    </div>
  );
};

export default Update;
